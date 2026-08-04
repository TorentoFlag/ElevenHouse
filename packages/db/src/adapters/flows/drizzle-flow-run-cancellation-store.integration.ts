import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { flowGraphSchema, flowGraphV2Schema, type FlowRunSnapshot } from "@elevenhouse/contracts";
import {
  cancelDurableFlowRun,
  compileFlowGraphV2,
  createBuiltInFlowNodeExecutorRegistry,
  FlowRuntimeIdempotencyConflictError,
  FlowRuntimeIdempotencyExpiredError,
  interpretFlowExecutionClaim,
  sha256CanonicalJson,
  type FlowExecutionClaim,
  type FlowRunCancellationCommand
} from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { reconcileFlowExecutionSafety } from "../../../scripts/flow-execution-safety-reconciliation";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzleFlowExecutionStore } from "./drizzle-flow-execution-store";
import { createDrizzleFlowRunCancellationStore } from "./drizzle-flow-run-cancellation-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_flow_cancel_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: {
  readonly pool: Pool;
  readonly database: ElevenHouseDatabase;
  readonly close: () => Promise<void>;
};

const graph = flowGraphV2Schema.parse({
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "manual",
      kind: "manual_client",
      displayTitle: "Клиент выбран вручную",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {}
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Подготовка завершена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_prepared" }
    }
  ],
  edges: [
    {
      id: "manual-completed",
      sourceNodeId: "manual",
      targetNodeId: "completed",
      sourceHandle: "next"
    }
  ]
});

function requireCapabilityManifest(input: typeof graph) {
  const compiled = compileFlowGraphV2(input);
  if (!compiled.capabilityManifest) raise("Expected publishable integration graph");
  return compiled.capabilityManifest;
}

const capabilityManifest = requireCapabilityManifest(graph);

const legacyGraph = flowGraphSchema.parse({
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "manual",
      title: "Ручной запуск",
      category: "trigger",
      kind: "manual",
      config: {}
    }
  ],
  edges: []
});

type CancellationFixture = {
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly runId: string;
  readonly tokenId: string | null;
  readonly sourceEventId: string;
};

describe("flow run cancellation store Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    const pool = new Pool({ connectionString: isolatedDatabaseUrl });
    runtime = {
      pool,
      database: drizzle(pool) as unknown as ElevenHouseDatabase,
      close: () => pool.end()
    };
    await runtime.pool.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
    const reconciliationClient = new Client({ connectionString: isolatedDatabaseUrl });
    await reconciliationClient.connect();
    try {
      await reconciliationClient.query("BEGIN");
      await reconcileFlowExecutionSafety(reconciliationClient);
      await reconciliationClient.query("COMMIT");
    } catch (error) {
      await reconciliationClient.query("ROLLBACK");
      throw error;
    } finally {
      await reconciliationClient.end();
    }
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  beforeEach(async () => {
    await runtime.pool.query("delete from users");
  });

  it("cancels one runnable token with a fenced command-linked trace and no execution attempt", async () => {
    const fixture = await createFixture();
    const store = createDrizzleFlowRunCancellationStore(runtime.database);

    const result = await cancelDurableFlowRun({
      store,
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      runId: fixture.runId,
      idempotencyKey: "cancel-runnable-1",
      request: {}
    });

    expect(result).toMatchObject({
      kind: "created",
      outcome: {
        kind: "succeeded",
        response: {
          statusCode: 200,
          body: {
            run: {
              id: fixture.runId,
              flowId: fixture.flowId,
              flowVersionId: fixture.flowVersionId,
              ownerUserId: fixture.ownerUserId,
              sourceEventId: fixture.sourceEventId,
              status: "canceled",
              currentNodeId: "completed"
            }
          }
        }
      }
    });

    const persisted = await selectCancellation(fixture.runId);
    expect(persisted.run).toMatchObject({
      status: "canceled",
      current_node_id: "completed",
      trace_sequence: "1"
    });
    expect(persisted.run?.completed_at).toEqual(persisted.run?.updated_at);
    expect(persisted.token).toMatchObject({
      state: "canceled",
      attempt_counter: "0",
      fencing_token: "1",
      claimed_at: null,
      lease_owner: null,
      lease_expires_at: null
    });
    expect(persisted.token?.terminal_at).toEqual(persisted.token?.updated_at);
    expect(persisted.attempts).toEqual([]);
    expect(persisted.commands).toMatchObject([
      {
        state: "succeeded",
        response_status: 200,
        response_body: result.outcome.response.body
      }
    ]);
    expect(persisted.events).toMatchObject([
      {
        sequence: "1",
        event_type: "run_canceled",
        node_id: "completed",
        attempt_id: null,
        command_id: persisted.commands[0]?.id,
        summary: {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "canceled",
          nodeKind: "completed",
          reasonCode: "FLOW_RUN_CANCELED_BY_OWNER",
          resultCode: "FLOW_RUN_CANCELED"
        }
      }
    ]);
  });

  it("cancels a scheduled retry without inventing another execution attempt", async () => {
    const fixture = await createFixture();
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const cancellationStore = createDrizzleFlowRunCancellationStore(runtime.database);
    const claim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-cancel-retry",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await executionStore.finalizeFailure({
      claim,
      failure: {
        classification: "retryable",
        reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE"
      }
    });

    await expect(
      cancelDurableFlowRun({
        store: cancellationStore,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        runId: fixture.runId,
        idempotencyKey: "cancel-retry-scheduled-1",
        request: {}
      })
    ).resolves.toMatchObject({ outcome: { kind: "succeeded" } });

    const persisted = await selectCancellation(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "canceled", trace_sequence: "2" });
    expect(persisted.token).toMatchObject({
      state: "canceled",
      attempt_counter: "1",
      fencing_token: "2",
      failure_disposition: null,
      failure_reason_code: null,
      quarantined_at: null
    });
    expect(persisted.attempts).toMatchObject([{ attempt_number: "1", outcome: "retry_scheduled" }]);
    expect(persisted.attempts).toHaveLength(1);
    expect(persisted.events).toMatchObject([
      { sequence: "1", event_type: "token_retry_scheduled" },
      { sequence: "2", event_type: "run_canceled", attempt_id: null }
    ]);
    await expect(
      executionStore.claimNext({
        leaseOwner: "flows-worker-after-canceled-retry",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"]
      })
    ).resolves.toBeNull();
  });

  it("lets a due retry claim commit first, then cancellation closes that exact attempt", async () => {
    const fixture = await createFixture();
    const tokenId = fixture.tokenId ?? raise("Expected execution token");
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const cancellationStore = createDrizzleFlowRunCancellationStore(runtime.database);
    const firstClaim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-retry-before-cancel-1",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await executionStore.finalizeFailure({
      claim: firstClaim,
      failure: {
        classification: "retryable",
        reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE"
      }
    });
    await runtime.pool.query(
      "update flow_execution_tokens set available_at = transaction_timestamp() - interval '1 second' where id = $1",
      [tokenId]
    );
    const retryClaim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-retry-before-cancel-2",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });

    await expect(
      cancelDurableFlowRun({
        store: cancellationStore,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        runId: fixture.runId,
        idempotencyKey: "cancel-after-due-retry-claim-1",
        request: {}
      })
    ).resolves.toMatchObject({ outcome: { kind: "succeeded" } });
    await expect(
      executionStore.finalizeFailure({
        claim: retryClaim,
        failure: {
          classification: "retryable",
          reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE"
        }
      })
    ).resolves.toEqual({ status: "stale" });

    const persisted = await selectCancellation(fixture.runId);
    expect(persisted.token).toMatchObject({
      state: "canceled",
      attempt_counter: "2",
      fencing_token: "3"
    });
    expect(persisted.attempts).toMatchObject([
      { attempt_number: "1", outcome: "retry_scheduled" },
      { attempt_number: "2", outcome: "canceled" }
    ]);
    expect(persisted.events.map((event) => event.event_type)).toEqual([
      "token_retry_scheduled",
      "run_canceled"
    ]);
  });

  it("serializes cancellation with a due retry claim without duplicating either transition", async () => {
    const fixture = await createFixture();
    const tokenId = fixture.tokenId ?? raise("Expected execution token");
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const cancellationStore = createDrizzleFlowRunCancellationStore(runtime.database);
    const firstClaim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-cancel-due-retry-1",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await executionStore.finalizeFailure({
      claim: firstClaim,
      failure: {
        classification: "retryable",
        reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE"
      }
    });
    await runtime.pool.query(
      "update flow_execution_tokens set available_at = transaction_timestamp() - interval '1 second' where id = $1",
      [tokenId]
    );

    const [cancelResult, retryClaimResult] = await Promise.all([
      cancelDurableFlowRun({
        store: cancellationStore,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        runId: fixture.runId,
        idempotencyKey: "cancel-due-retry-race-1",
        request: {}
      }),
      executionStore.claimNext({
        leaseOwner: "flows-worker-cancel-due-retry-2",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"]
      })
    ]);

    expect(cancelResult).toMatchObject({ outcome: { kind: "succeeded" } });
    const persisted = await selectCancellation(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "canceled", trace_sequence: "2" });
    expect(persisted.token).toMatchObject({ state: "canceled" });
    if (retryClaimResult?.status === "claimed") {
      expect(persisted.attempts).toMatchObject([
        { attempt_number: "1", outcome: "retry_scheduled" },
        { attempt_number: "2", outcome: "canceled" }
      ]);
      expect(persisted.token).toMatchObject({ attempt_counter: "2", fencing_token: "3" });
    } else {
      expect(retryClaimResult).toBeNull();
      expect(persisted.attempts).toMatchObject([
        { attempt_number: "1", outcome: "retry_scheduled" }
      ]);
      expect(persisted.token).toMatchObject({ attempt_counter: "1", fencing_token: "2" });
    }
    expect(persisted.events).toHaveLength(2);
    expect(persisted.events.map((event) => event.event_type)).toEqual([
      "token_retry_scheduled",
      "run_canceled"
    ]);
  });

  it("closes a claimed attempt from locked DB audit state and makes the worker stale", async () => {
    const fixture = await createFixture();
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const cancellationStore = createDrizzleFlowRunCancellationStore(runtime.database);
    const claim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-cancel-claimed",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    await expect(
      cancelDurableFlowRun({
        store: cancellationStore,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        runId: fixture.runId,
        idempotencyKey: "cancel-claimed-1",
        request: {}
      })
    ).resolves.toMatchObject({ outcome: { kind: "succeeded" } });
    await expect(executionStore.finalize({ claim, decision })).resolves.toEqual({
      status: "stale"
    });

    const persisted = await selectCancellation(fixture.runId);
    expect(persisted.token).toMatchObject({
      state: "canceled",
      attempt_counter: "1",
      fencing_token: "2",
      lease_owner: null,
      lease_expires_at: null
    });
    expect(persisted.attempts).toMatchObject([
      {
        attempt_number: "1",
        fencing_token: "1",
        lease_owner: "flows-worker-cancel-claimed",
        outcome: "canceled",
        result_code: "FLOW_RUN_CANCELED"
      }
    ]);
    expect(persisted.attempts[0]?.started_at.toISOString()).toBe(claim.claimedAt);
    expect(persisted.events).toMatchObject([
      {
        sequence: "1",
        event_type: "run_canceled",
        attempt_id: persisted.attempts[0]?.id,
        command_id: persisted.commands[0]?.id
      }
    ]);
  });

  it("timestamps cancellation after a blocked token lock and after the claimed attempt starts", async () => {
    const fixture = await createFixture();
    const tokenId = fixture.tokenId ?? raise("Expected execution token");
    const blocker = await runtime.pool.connect();
    const store = createDrizzleFlowRunCancellationStore(runtime.database);
    let blockerReleased = false;
    let cancellation: ReturnType<typeof cancelFixture> | undefined;

    try {
      await blocker.query("begin");
      await blocker.query("select id from flow_execution_tokens where id = $1 for update", [
        tokenId
      ]);
      cancellation = cancelFixture(store, fixture, "cancel-after-blocked-claim-1");
      await waitForBlockedFlowTokenLock();

      const claimed = await blocker.query<{ claimed_at: Date }>(
        `update flow_execution_tokens
            set state = 'claimed', claimed_at = clock_timestamp(),
                lease_owner = 'flows-worker-blocked-cancel',
                lease_expires_at = clock_timestamp() + interval '30 seconds',
                attempt_counter = 1, fencing_token = 1,
                updated_at = clock_timestamp()
          where id = $1
          returning claimed_at`,
        [tokenId]
      );
      await blocker.query("update flow_runs set status = 'running' where id = $1", [fixture.runId]);
      await blocker.query("select pg_sleep(0.075)");
      await blocker.query("commit");
      blockerReleased = true;

      await expect(cancellation).resolves.toMatchObject({ outcome: { kind: "succeeded" } });
      const persisted = await selectCancellation(fixture.runId);
      const startedAt = claimed.rows[0]?.claimed_at ?? raise("Expected claimed timestamp");
      const completedAt = persisted.attempts[0]?.completed_at as Date | undefined;
      const eventAt = persisted.events[0]?.occurred_at as Date | undefined;
      const tokenTerminalAt = persisted.token?.terminal_at as Date | undefined;
      const runCompletedAt = persisted.run?.completed_at as Date | undefined;
      const commandCompletedAt = persisted.commands[0]?.completed_at as Date | undefined;
      const outcomeCreatedAt = persisted.commands[0]?.outcome_created_at as Date | undefined;

      for (const timestamp of [
        completedAt,
        eventAt,
        tokenTerminalAt,
        runCompletedAt,
        commandCompletedAt,
        outcomeCreatedAt
      ]) {
        expect(timestamp?.getTime()).toBeGreaterThanOrEqual(startedAt.getTime());
      }
      expect(persisted.attempts).toMatchObject([
        {
          attempt_number: "1",
          fencing_token: "1",
          lease_owner: "flows-worker-blocked-cancel",
          outcome: "canceled"
        }
      ]);
    } finally {
      if (!blockerReleased) await blocker.query("rollback").catch(() => undefined);
      blocker.release();
      await cancellation?.catch(() => undefined);
    }
  }, 10_000);

  it("fails closed without mutation when a claimed token uses a future database clock", async () => {
    const fixture = await createFixture();
    const tokenId = fixture.tokenId ?? raise("Expected execution token");
    const store = createDrizzleFlowRunCancellationStore(runtime.database);
    await runtime.pool.query(
      `update flow_execution_tokens
          set state = 'claimed',
              claimed_at = clock_timestamp() + interval '1 minute',
              lease_owner = 'flows-worker-future-cancel',
              lease_expires_at = clock_timestamp() + interval '2 minutes',
              attempt_counter = 1, fencing_token = 1,
              updated_at = clock_timestamp() + interval '1 minute'
        where id = $1`,
      [tokenId]
    );
    await runtime.pool.query("update flow_runs set status = 'running' where id = $1", [
      fixture.runId
    ]);

    await expect(cancelFixture(store, fixture, "cancel-future-clock-1")).resolves.toMatchObject({
      kind: "created",
      outcome: {
        kind: "rejected",
        response: { statusCode: 409, body: { code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" } }
      }
    });
    const persisted = await selectCancellation(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(persisted.token).toMatchObject({
      state: "claimed",
      lease_owner: "flows-worker-future-cancel",
      attempt_counter: "1",
      fencing_token: "1"
    });
    expect(persisted.attempts).toEqual([]);
    expect(persisted.events).toEqual([]);
    expect(persisted.commands).toMatchObject([{ state: "failed", response_status: 409 }]);
  });

  it("serializes cancel and finalize so exactly one terminal transition wins", async () => {
    const fixture = await createFixture();
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const cancellationStore = createDrizzleFlowRunCancellationStore(runtime.database);
    const claim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-cancel-finalize-race",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    const [cancelResult, finalizeResult] = await Promise.all([
      cancelDurableFlowRun({
        store: cancellationStore,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        runId: fixture.runId,
        idempotencyKey: "cancel-finalize-race-1",
        request: {}
      }),
      executionStore.finalize({ claim, decision })
    ]);
    const persisted = await selectCancellation(fixture.runId);

    if (finalizeResult.status === "applied") {
      expect(cancelResult).toMatchObject({
        outcome: {
          kind: "rejected",
          response: {
            statusCode: 409,
            body: { code: "FLOW_RUN_CANCEL_NOT_ALLOWED", status: "completed" }
          }
        }
      });
      expect(persisted.run).toMatchObject({ status: "completed", trace_sequence: "1" });
      expect(persisted.token).toMatchObject({ state: "completed", fencing_token: "1" });
      expect(persisted.events).toMatchObject([{ event_type: "run_completed", command_id: null }]);
    } else {
      expect(cancelResult).toMatchObject({ outcome: { kind: "succeeded" } });
      expect(persisted.run).toMatchObject({ status: "canceled", trace_sequence: "1" });
      expect(persisted.token).toMatchObject({ state: "canceled", fencing_token: "2" });
      expect(persisted.events).toMatchObject([{ event_type: "run_canceled" }]);
    }
    expect(persisted.events).toHaveLength(1);
    expect(persisted.commands).toHaveLength(1);
  });

  it("serializes cancel and expired-lease recovery without losing either committed trace", async () => {
    const fixture = await createFixture();
    const tokenId = fixture.tokenId ?? raise("Expected execution token");
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const cancellationStore = createDrizzleFlowRunCancellationStore(runtime.database);
    await executionStore.claimNext({
      leaseOwner: "flows-worker-cancel-recovery-race",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await runtime.pool.query(
      `update flow_execution_tokens
          set claimed_at = transaction_timestamp() - interval '2 seconds',
              lease_expires_at = transaction_timestamp() - interval '1 second'
        where id = $1`,
      [tokenId]
    );

    const [cancelResult, recovered] = await Promise.all([
      cancelDurableFlowRun({
        store: cancellationStore,
        actorUserId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        runId: fixture.runId,
        idempotencyKey: "cancel-recovery-race-1",
        request: {}
      }),
      executionStore.recoverExpired({ limit: 10 })
    ]);

    expect(cancelResult).toMatchObject({ outcome: { kind: "succeeded" } });
    expect([0, 1]).toContain(recovered.recoveredCount);
    const persisted = await selectCancellation(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "canceled" });
    if (recovered.recoveredCount === 0) {
      expect(persisted.token).toMatchObject({ state: "canceled", fencing_token: "2" });
      expect(persisted.attempts).toMatchObject([{ outcome: "canceled", fencing_token: "1" }]);
      expect(persisted.events).toMatchObject([{ sequence: "1", event_type: "run_canceled" }]);
    } else {
      expect(persisted.token).toMatchObject({ state: "canceled", fencing_token: "3" });
      expect(persisted.attempts).toMatchObject([{ outcome: "lease_expired", fencing_token: "1" }]);
      expect(persisted.events).toMatchObject([
        { sequence: "1", event_type: "token_lease_expired" },
        { sequence: "2", event_type: "run_canceled" }
      ]);
    }
  });

  it("keeps recovery empty when cancellation commits before the expired-lease sweep", async () => {
    const fixture = await createFixture();
    const tokenId = fixture.tokenId ?? raise("Expected execution token");
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const cancellationStore = createDrizzleFlowRunCancellationStore(runtime.database);
    await claimExecution(executionStore, {
      leaseOwner: "flows-worker-cancel-before-recovery",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await runtime.pool.query(
      `update flow_execution_tokens
          set claimed_at = transaction_timestamp() - interval '2 seconds',
              lease_expires_at = transaction_timestamp() - interval '1 second'
        where id = $1`,
      [tokenId]
    );

    await expect(
      cancelFixture(cancellationStore, fixture, "cancel-before-recovery-1")
    ).resolves.toMatchObject({ outcome: { kind: "succeeded" } });
    await expect(executionStore.recoverExpired({ limit: 10 })).resolves.toEqual({
      recoveredCount: 0,
      retryScheduledCount: 0,
      failedTerminalCount: 0,
      quarantinedCount: 0
    });

    const persisted = await selectCancellation(fixture.runId);
    expect(persisted.token).toMatchObject({ state: "canceled", fencing_token: "2" });
    expect(persisted.attempts).toMatchObject([{ outcome: "canceled", fencing_token: "1" }]);
    expect(persisted.events).toMatchObject([{ sequence: "1", event_type: "run_canceled" }]);
  });

  it("lets expired-lease recovery commit first, then cancellation preserves its trace", async () => {
    const fixture = await createFixture();
    const tokenId = fixture.tokenId ?? raise("Expected execution token");
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const cancellationStore = createDrizzleFlowRunCancellationStore(runtime.database);
    await claimExecution(executionStore, {
      leaseOwner: "flows-worker-recovery-before-cancel",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await runtime.pool.query(
      `update flow_execution_tokens
          set claimed_at = transaction_timestamp() - interval '2 seconds',
              lease_expires_at = transaction_timestamp() - interval '1 second'
        where id = $1`,
      [tokenId]
    );

    await expect(executionStore.recoverExpired({ limit: 10 })).resolves.toEqual({
      recoveredCount: 1,
      retryScheduledCount: 1,
      failedTerminalCount: 0,
      quarantinedCount: 0
    });
    await expect(
      cancelFixture(cancellationStore, fixture, "cancel-after-recovery-1")
    ).resolves.toMatchObject({ outcome: { kind: "succeeded" } });

    const persisted = await selectCancellation(fixture.runId);
    expect(persisted.token).toMatchObject({ state: "canceled", fencing_token: "3" });
    expect(persisted.attempts).toMatchObject([
      { attempt_number: "1", outcome: "lease_expired", fencing_token: "1" }
    ]);
    expect(persisted.events).toMatchObject([
      { sequence: "1", event_type: "token_lease_expired" },
      { sequence: "2", event_type: "run_canceled", attempt_id: null }
    ]);
  });

  it("replays the exact persisted success without changing any business or command row", async () => {
    const fixture = await createFixture();
    const store = createDrizzleFlowRunCancellationStore(runtime.database);
    const first = await cancelFixture(store, fixture, "cancel-exact-replay-1");
    const beforeReplay = await selectCancellation(fixture.runId);

    const replay = await cancelFixture(store, fixture, "cancel-exact-replay-1");
    const afterReplay = await selectCancellation(fixture.runId);

    expect(first.kind).toBe("created");
    expect(replay).toEqual({ kind: "replayed", outcome: first.outcome });
    expect(afterReplay).toEqual(beforeReplay);
  });

  it("rejects the same idempotency identity with a different canonical request hash", async () => {
    const fixture = await createFixture();
    const store = createDrizzleFlowRunCancellationStore(runtime.database);
    const command = cancellationCommand(fixture, "cancel-hash-conflict-1");
    await store.executeCancel({ command });

    await expect(
      store.executeCancel({
        command: {
          ...command,
          requestHash: sha256CanonicalJson({ schemaVersion: "different-request.v1" })
        }
      })
    ).rejects.toBeInstanceOf(FlowRuntimeIdempotencyConflictError);
    const persisted = await selectCancellation(fixture.runId);
    expect(persisted.commands).toHaveLength(1);
    expect(persisted.events).toHaveLength(1);
  });

  it("elects one creator for concurrent same-key requests and replays the winner", async () => {
    const fixture = await createFixture();
    const store = createDrizzleFlowRunCancellationStore(runtime.database);

    const results = await Promise.all([
      cancelFixture(store, fixture, "cancel-concurrent-key-1"),
      cancelFixture(store, fixture, "cancel-concurrent-key-1")
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual(["created", "replayed"]);
    expect(results[0]?.outcome).toEqual(results[1]?.outcome);
    const persisted = await selectCancellation(fixture.runId);
    expect(persisted.commands).toHaveLength(1);
    expect(persisted.events).toHaveLength(1);
    expect(persisted.token).toMatchObject({ fencing_token: "1" });
  });

  it("bounds token lock wait and leaves the same idempotency key retryable", async () => {
    const fixture = await createFixture();
    const tokenId = fixture.tokenId ?? raise("Expected token id");
    const blocker = await runtime.pool.connect();
    const store = createDrizzleFlowRunCancellationStore(runtime.database);
    const idempotencyKey = "cancel-lock-timeout-1";
    await blocker.query("begin");
    await blocker.query("select id from flow_execution_tokens where id = $1 for update", [tokenId]);

    const attempt = cancelFixture(store, fixture, idempotencyKey).then(
      (result) => ({ kind: "resolved" as const, result }),
      (error: unknown) => ({ kind: "rejected" as const, error })
    );
    const boundedResult = await (async () => {
      try {
        return await Promise.race([
          attempt,
          new Promise<{ readonly kind: "timed_out" }>((resolve) => {
            setTimeout(() => resolve({ kind: "timed_out" }), 2_000);
          })
        ]);
      } finally {
        await blocker.query("rollback");
        blocker.release();
      }
    })();
    await attempt;

    expect(boundedResult).toMatchObject({
      kind: "rejected",
      error: { code: "FLOW_RUNTIME_COMMAND_BUSY" }
    });
    expect((await selectCancellation(fixture.runId)).commands).toEqual([]);
    await expect(cancelFixture(store, fixture, idempotencyKey)).resolves.toMatchObject({
      kind: "created",
      outcome: { kind: "succeeded" }
    });
  }, 10_000);

  it("persists a new semantic success for a different key after cancellation without a second trace", async () => {
    const fixture = await createFixture();
    const store = createDrizzleFlowRunCancellationStore(runtime.database);
    const first = await cancelFixture(store, fixture, "cancel-first-key-1");
    const firstState = await selectCancellation(fixture.runId);

    const second = await cancelFixture(store, fixture, "cancel-second-key-1");
    const secondState = await selectCancellation(fixture.runId);

    expect(first).toMatchObject({ kind: "created", outcome: { kind: "succeeded" } });
    expect(second).toMatchObject({ kind: "created", outcome: { kind: "succeeded" } });
    expect(second.outcome.response.body).toEqual(first.outcome.response.body);
    expect(secondState.commands).toHaveLength(2);
    expect(secondState.events).toHaveLength(1);
    expect(secondState.run?.row_xmin).toBe(firstState.run?.row_xmin);
    expect(secondState.token?.row_xmin).toBe(firstState.token?.row_xmin);
  });

  it("rejects a cancellation trace linked to a failed runtime command", async () => {
    const fixture = await createFixture();

    await expect(insertCanceledStateWithFailedCommand(fixture)).rejects.toThrow(
      "cancellation event requires a succeeded runtime command"
    );
  });

  it("fails closed when canceled state lacks succeeded command provenance", async () => {
    const fixture = await createFixture();
    await insertCanceledStateWithFailedCommand(fixture, { bypassProvenanceGuard: true });
    const store = createDrizzleFlowRunCancellationStore(runtime.database);

    const result = await cancelFixture(store, fixture, "cancel-invalid-provenance-2");

    expect(result).toMatchObject({
      kind: "created",
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: { code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" }
        }
      }
    });
    const persisted = await selectCancellation(fixture.runId);
    expect(persisted.events).toHaveLength(1);
    expect(persisted.commands).toMatchObject([
      { state: "failed", response_status: 409 },
      { state: "failed", response_status: 409 }
    ]);
  });

  it("persists and exactly replays a typed terminal conflict after finalize wins", async () => {
    const fixture = await createFixture();
    const executionStore = createDrizzleFlowExecutionStore(runtime.database);
    const cancellationStore = createDrizzleFlowRunCancellationStore(runtime.database);
    const claim = await claimExecution(executionStore, {
      leaseOwner: "flows-worker-finalized-before-cancel",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await executionStore.finalize({ claim, decision });

    const first = await cancelFixture(cancellationStore, fixture, "cancel-completed-conflict-1");
    const replay = await cancelFixture(cancellationStore, fixture, "cancel-completed-conflict-1");

    expect(first).toMatchObject({
      kind: "created",
      outcome: {
        kind: "rejected",
        response: {
          statusCode: 409,
          body: { code: "FLOW_RUN_CANCEL_NOT_ALLOWED", status: "completed" }
        }
      }
    });
    expect(replay).toEqual({ kind: "replayed", outcome: first.outcome });
    const persisted = await selectCancellation(fixture.runId);
    expect(persisted.commands).toMatchObject([{ state: "failed", response_status: 409 }]);
    expect(persisted.events).toMatchObject([{ event_type: "run_completed", command_id: null }]);
  });

  it("returns indistinguishable durable 404 outcomes for absent and foreign runs", async () => {
    const missingOwnerUserId = await createUser();
    const foreignFixture = await createFixture();
    const foreignCallerUserId = await createUser();
    const store = createDrizzleFlowRunCancellationStore(runtime.database);
    const missingFixture: CancellationFixture = {
      ownerUserId: missingOwnerUserId,
      flowId: randomUUID(),
      flowVersionId: randomUUID(),
      runId: randomUUID(),
      tokenId: null,
      sourceEventId: "not-visible"
    };
    const foreignView = { ...foreignFixture, ownerUserId: foreignCallerUserId };

    const missing = await cancelFixture(store, missingFixture, "cancel-missing-run-1");
    const foreign = await cancelFixture(store, foreignView, "cancel-foreign-run-1");

    expect(missing.outcome).toEqual(foreign.outcome);
    expect(missing).toMatchObject({
      kind: "created",
      outcome: {
        kind: "rejected",
        response: { statusCode: 404, body: { code: "FLOW_RUN_NOT_FOUND" } }
      }
    });
    expect((await selectCancellation(missingFixture.runId)).commands).toMatchObject([
      { state: "failed", response_status: 404 }
    ]);
    const persistedForeign = await selectCancellation(foreignFixture.runId);
    expect(persistedForeign.run).toMatchObject({ status: "pending", trace_sequence: "0" });
    expect(persistedForeign.events).toEqual([]);
  });

  it("fails closed for a legacy run and for a future external-wait token", async () => {
    const legacy = await createFixture({ legacy: true, includeToken: false });
    const waiting = await createFixture();
    const waitingTokenId = waiting.tokenId ?? raise("Expected waiting token");
    await runtime.pool.query(
      "update flow_execution_tokens set state = 'waiting_external' where id = $1",
      [waitingTokenId]
    );
    await runtime.pool.query("update flow_runs set status = 'waiting' where id = $1", [
      waiting.runId
    ]);
    const store = createDrizzleFlowRunCancellationStore(runtime.database);

    const legacyResult = await cancelFixture(store, legacy, "cancel-legacy-run-1");
    const waitingResult = await cancelFixture(store, waiting, "cancel-waiting-external-1");

    for (const result of [legacyResult, waitingResult]) {
      expect(result).toMatchObject({
        kind: "created",
        outcome: {
          kind: "rejected",
          response: { statusCode: 409, body: { code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" } }
        }
      });
    }
    expect((await selectCancellation(legacy.runId)).events).toEqual([]);
    expect((await selectCancellation(waiting.runId)).token).toMatchObject({
      state: "waiting_external",
      fencing_token: "0"
    });
  });

  it("rolls back command, token, run and attempt when the cancellation event cannot persist", async () => {
    const fixture = await createFixture();
    const store = createDrizzleFlowRunCancellationStore(runtime.database);
    await installFlowEventInsertFailure();
    try {
      const failure = await cancelFixture(store, fixture, "cancel-event-rollback-1").catch(
        (error: unknown) => error
      );
      expect(errorChain(failure)).toContain("forced flow run event insert failure");
    } finally {
      await removeFlowEventInsertFailure();
    }

    const afterFailure = await selectCancellation(fixture.runId);
    expect(afterFailure.run).toMatchObject({ status: "pending", trace_sequence: "0" });
    expect(afterFailure.token).toMatchObject({ state: "runnable", fencing_token: "0" });
    expect(afterFailure.attempts).toEqual([]);
    expect(afterFailure.events).toEqual([]);
    expect(afterFailure.commands).toEqual([]);
    await expect(cancelFixture(store, fixture, "cancel-event-rollback-1")).resolves.toMatchObject({
      outcome: { kind: "succeeded" }
    });
  });

  it("enforces immutable runtime command identity, outcomes and command-linked history", async () => {
    const fixture = await createFixture();
    const store = createDrizzleFlowRunCancellationStore(runtime.database);
    await cancelFixture(store, fixture, "cancel-immutable-ledger-1");
    const persisted = await selectCancellation(fixture.runId);
    const commandId = persisted.commands[0]?.id ?? raise("Expected runtime command id");
    const eventId = persisted.events[0]?.id ?? raise("Expected cancellation event id");

    await expect(
      runtime.pool.query(
        "update flow_runtime_commands set idempotency_key = 'tampered-key' where id = $1",
        [commandId]
      )
    ).rejects.toThrow("flow runtime command identity is immutable");
    await expect(
      runtime.pool.query(
        "update flow_runtime_command_outcomes set response_body = '{}'::jsonb where command_id = $1",
        [commandId]
      )
    ).rejects.toThrow("flow runtime command outcomes are immutable");
    await expect(
      runtime.pool.query("delete from flow_run_events where id = $1", [eventId])
    ).rejects.toThrow("flow run events can only be deleted with their run");
    await expect(
      runtime.pool.query("delete from flow_runtime_commands where id = $1", [commandId])
    ).rejects.toThrow("flow runtime command tombstones are retained for the owner lifetime");
  });

  it("rejects reuse after the durable 24-hour replay window", async () => {
    const ownerUserId = await createUser();
    const fixture: CancellationFixture = {
      ownerUserId,
      flowId: randomUUID(),
      flowVersionId: randomUUID(),
      runId: randomUUID(),
      tokenId: null,
      sourceEventId: "expired"
    };
    const command = cancellationCommand(fixture, "cancel-expired-key-1");
    await insertExpiredCommand(command);
    const store = createDrizzleFlowRunCancellationStore(runtime.database);

    await expect(store.executeCancel({ command })).rejects.toBeInstanceOf(
      FlowRuntimeIdempotencyExpiredError
    );
    expect((await selectCancellation(fixture.runId)).commands).toHaveLength(1);
  });

  it("purges an expired exact replay payload while retaining its immutable command tombstone", async () => {
    const ownerUserId = await createUser();
    const fixture: CancellationFixture = {
      ownerUserId,
      flowId: randomUUID(),
      flowVersionId: randomUUID(),
      runId: randomUUID(),
      tokenId: null,
      sourceEventId: "expired-payload"
    };
    const command = cancellationCommand(fixture, "cancel-expired-payload-1");
    await insertExpiredCommand(command);
    const before = await selectCancellation(fixture.runId);
    const commandId = before.commands[0]?.id ?? raise("Expected expired command id");

    await expect(
      runtime.pool.query("delete from flow_runtime_command_outcomes where command_id = $1", [
        commandId
      ])
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      runtime.pool.query("delete from flow_runtime_commands where id = $1", [commandId])
    ).rejects.toThrow("flow runtime command tombstones are retained for the owner lifetime");

    expect((await selectCancellation(fixture.runId)).commands).toMatchObject([
      { id: commandId, state: "failed", response_status: null, response_body: null }
    ]);
  });

  async function createFixture(
    input: { readonly legacy?: boolean; readonly includeToken?: boolean } = {}
  ): Promise<CancellationFixture> {
    const client = await runtime.pool.connect();
    const sourceEventId = `manual:${randomUUID()}`;
    const fixtureGraph = input.legacy ? legacyGraph : graph;
    const presentation = input.legacy
      ? null
      : {
          schemaVersion: "flow-presentation.v1",
          nodes: [
            { nodeId: "manual", position: { x: 120, y: 120 } },
            { nodeId: "completed", position: { x: 420, y: 120 } }
          ],
          viewport: { x: 0, y: 0, zoom: 1 }
        };

    try {
      await client.query("begin");
      const user = await client.query<{ id: string }>(
        "insert into users (status) values ('active') returning id"
      );
      const ownerUserId = user.rows[0]?.id ?? raise("Expected owner user id");
      const flow = await client.query<{ id: string }>(
        `insert into flows
          (owner_user_id, name, origin, status, definition_state, approval_mode,
           revision, draft_graph, draft_presentation, created_at, updated_at)
         values ($1, 'Cancellation fixture', $2, 'draft', 'draft', 'manual_approve',
           1, $3, $4, transaction_timestamp(), transaction_timestamp())
         returning id`,
        [
          ownerUserId,
          input.legacy ? null : { schemaVersion: "flow-definition-origin.v1", type: "blank" },
          fixtureGraph,
          presentation
        ]
      );
      const flowId = flow.rows[0]?.id ?? raise("Expected flow id");
      const version = await client.query<{ id: string }>(
        `insert into flow_versions
          (flow_id, owner_user_id, version, source_revision, approval_mode,
           graph_schema_version, graph, presentation, capability_manifest, published_at)
         values ($1, $2, 1, $3, 'manual_approve', $4, $5, $6, $7,
           transaction_timestamp())
         returning id`,
        [
          flowId,
          ownerUserId,
          input.legacy ? null : 1,
          input.legacy ? null : "flow-graph.v2",
          fixtureGraph,
          presentation,
          input.legacy ? null : capabilityManifest
        ]
      );
      const flowVersionId = version.rows[0]?.id ?? raise("Expected flow version id");
      await client.query(
        `update flows
            set status = 'published', definition_state = 'versioned',
                published_version_id = $2,
                published_at = (
                  select published_at from flow_versions where id = $2 and flow_id = $1
                ),
                updated_at = transaction_timestamp()
          where id = $1`,
        [flowId, flowVersionId]
      );
      const runtimeEvent = await client.query<{ id: string }>(
        `insert into flow_runtime_events
          (owner_user_id, source, source_event_id, dedupe_key, subject_type,
           subject_id, occurred_at, payload)
         values ($1, 'manual', $2, $2, 'client', $3, transaction_timestamp(), '{}')
         returning id`,
        [ownerUserId, sourceEventId, randomUUID()]
      );
      const runtimeEventId = runtimeEvent.rows[0]?.id ?? raise("Expected runtime event id");
      const snapshot: FlowRunSnapshot = {
        schemaVersion: "flow-run-snapshot.v1",
        flowVersionId,
        sourceEventId,
        subjectType: "client",
        subjectId: randomUUID(),
        occurredAt: "2026-08-03T12:00:00.000Z",
        timeZone: "Europe/Moscow",
        consent: {},
        channels: {},
        payload: {}
      };
      const run = await client.query<{ id: string }>(
        `insert into flow_runs
          (owner_user_id, flow_id, flow_version_id, runtime_event_id, status,
           snapshot, current_node_id, created_at, updated_at)
         values ($1, $2, $3, $4, 'pending', $5, 'completed',
           transaction_timestamp(), transaction_timestamp())
         returning id`,
        [ownerUserId, flowId, flowVersionId, runtimeEventId, snapshot]
      );
      const runId = run.rows[0]?.id ?? raise("Expected run id");
      const includeToken = input.includeToken ?? !input.legacy;
      const tokenId = includeToken
        ? ((
            await client.query<{ id: string }>(
              `insert into flow_execution_tokens
                (owner_user_id, flow_run_id, flow_version_id, node_id, node_kind,
                 config_schema_version, executor_contract_version, executor_key, state,
                 available_at, created_at, updated_at)
               values ($1, $2, $3, 'completed', 'completed', 1, 1,
                 'completed:1:1', 'runnable', transaction_timestamp(),
                 transaction_timestamp(), transaction_timestamp())
               returning id`,
              [ownerUserId, runId, flowVersionId]
            )
          ).rows[0]?.id ?? raise("Expected token id"))
        : null;
      await client.query("commit");
      return { ownerUserId, flowId, flowVersionId, runId, tokenId, sourceEventId };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async function selectCancellation(runId: string) {
    const [run, token, attempts, events, commands] = await Promise.all([
      runtime.pool.query("select xmin::text as row_xmin, * from flow_runs where id = $1", [runId]),
      runtime.pool.query(
        "select xmin::text as row_xmin, * from flow_execution_tokens where flow_run_id = $1",
        [runId]
      ),
      runtime.pool.query(
        "select xmin::text as row_xmin, * from flow_execution_attempts where flow_run_id = $1 order by completed_at, id",
        [runId]
      ),
      runtime.pool.query(
        "select xmin::text as row_xmin, * from flow_run_events where flow_run_id = $1 order by sequence",
        [runId]
      ),
      runtime.pool.query(
        `select command.xmin::text as command_xmin,
                outcome.xmin::text as outcome_xmin,
                command.*, outcome.response_status, outcome.response_body,
                outcome.created_at as outcome_created_at
           from flow_runtime_commands command
           left join flow_runtime_command_outcomes outcome on outcome.command_id = command.id
          where command.resource_id = $1
          order by command.created_at, command.id`,
        [runId]
      )
    ]);
    return {
      run: run.rows[0] ?? null,
      token: token.rows[0] ?? null,
      attempts: attempts.rows,
      events: events.rows,
      commands: commands.rows
    };
  }

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user id");
  }

  function cancelFixture(
    store: ReturnType<typeof createDrizzleFlowRunCancellationStore>,
    fixture: CancellationFixture,
    idempotencyKey: string
  ) {
    return cancelDurableFlowRun({
      store,
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      runId: fixture.runId,
      idempotencyKey,
      request: {}
    });
  }

  async function waitForBlockedFlowTokenLock(): Promise<void> {
    const deadline = Date.now() + 750;
    while (Date.now() < deadline) {
      const result = await runtime.pool.query<{ blocked: boolean }>(`
        SELECT EXISTS (
          SELECT 1
            FROM pg_stat_activity
           WHERE datname = current_database()
             AND pid <> pg_backend_pid()
             AND wait_event_type = 'Lock'
             AND query ILIKE '%flow_execution_tokens%'
        ) AS blocked
      `);
      if (result.rows[0]?.blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Cancellation did not block on the execution token lock");
  }

  function cancellationCommand(
    fixture: CancellationFixture,
    idempotencyKey: string
  ): FlowRunCancellationCommand {
    const command = {
      apiSurface: "astrologer-api" as const,
      actorUserId: fixture.ownerUserId,
      ownerUserId: fixture.ownerUserId,
      routeTemplate: "/flow-runs/:runId/cancel" as const,
      resourceId: fixture.runId,
      scope: "flows.runtime.cancel.v1" as const,
      idempotencyKey
    };
    return {
      ...command,
      requestHash: sha256CanonicalJson({
        schemaVersion: "flow-runtime-command.v1",
        ...command,
        request: { schemaVersion: "flow-run-cancel-request.v1", body: {} }
      })
    };
  }

  async function insertExpiredCommand(command: FlowRunCancellationCommand): Promise<void> {
    await runtime.pool.query(
      `with inserted as (
         insert into flow_runtime_commands
           (api_surface, actor_user_id, owner_user_id, route_template, resource_id,
            command_scope, idempotency_key, request_hash, state, completed_at,
            replay_until, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'failed',
           transaction_timestamp() - interval '25 hours',
           transaction_timestamp() - interval '1 hour',
           transaction_timestamp() - interval '25 hours',
           transaction_timestamp() - interval '25 hours')
         returning id, completed_at
       )
       insert into flow_runtime_command_outcomes
         (command_id, response_status, response_body, created_at)
       select id, 404, '{"code":"FLOW_RUN_NOT_FOUND"}'::jsonb, completed_at
         from inserted`,
      [
        command.apiSurface,
        command.actorUserId,
        command.ownerUserId,
        command.routeTemplate,
        command.resourceId,
        command.scope,
        command.idempotencyKey,
        command.requestHash
      ]
    );
  }

  async function insertCanceledStateWithFailedCommand(
    fixture: CancellationFixture,
    options: { readonly bypassProvenanceGuard?: boolean } = {}
  ): Promise<void> {
    const client = await runtime.pool.connect();
    const command = cancellationCommand(fixture, "cancel-invalid-provenance-1");
    let provenanceGuardDisabled = false;
    try {
      if (options.bypassProvenanceGuard) {
        await client.query(
          "alter table flow_run_events disable trigger flow_run_event_command_consistency"
        );
        provenanceGuardDisabled = true;
      }
      await client.query("begin");
      const inserted = await client.query<{ id: string }>(
        `insert into flow_runtime_commands
          (api_surface, actor_user_id, owner_user_id, route_template, resource_id,
           command_scope, idempotency_key, request_hash, state, completed_at,
           replay_until, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'failed',
           transaction_timestamp(), transaction_timestamp() + interval '24 hours',
           transaction_timestamp(), transaction_timestamp())
         returning id`,
        [
          command.apiSurface,
          command.actorUserId,
          command.ownerUserId,
          command.routeTemplate,
          command.resourceId,
          command.scope,
          command.idempotencyKey,
          command.requestHash
        ]
      );
      const commandId = inserted.rows[0]?.id ?? raise("Expected failed command id");
      await client.query(
        `insert into flow_runtime_command_outcomes
          (command_id, response_status, response_body, created_at)
         values ($1, 409, '{"code":"FLOW_RUNTIME_EXECUTION_UNAVAILABLE"}'::jsonb,
           transaction_timestamp())`,
        [commandId]
      );
      await client.query(
        `update flow_execution_tokens
            set state = 'canceled', fencing_token = fencing_token + 1,
                terminal_at = transaction_timestamp(), updated_at = transaction_timestamp()
          where id = $1`,
        [fixture.tokenId]
      );
      await client.query(
        `update flow_runs
            set status = 'canceled', trace_sequence = 1,
                completed_at = transaction_timestamp(), updated_at = transaction_timestamp()
          where id = $1`,
        [fixture.runId]
      );
      await client.query(
        `insert into flow_run_events
          (owner_user_id, flow_run_id, sequence, event_type, node_id, command_id,
           summary, occurred_at)
         values ($1, $2, 1, 'run_canceled', 'completed', $3, $4,
           transaction_timestamp())`,
        [
          fixture.ownerUserId,
          fixture.runId,
          commandId,
          {
            schemaVersion: "flow-runtime-trace.v1",
            outcome: "canceled",
            nodeKind: "completed",
            reasonCode: "FLOW_RUN_CANCELED_BY_OWNER",
            resultCode: "FLOW_RUN_CANCELED"
          }
        ]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      if (provenanceGuardDisabled) {
        await client.query(
          "alter table flow_run_events enable trigger flow_run_event_command_consistency"
        );
      }
      client.release();
    }
  }

  async function installFlowEventInsertFailure(): Promise<void> {
    await runtime.pool.query(`
      CREATE OR REPLACE FUNCTION elevenhouse_test_fail_cancel_event_insert()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $test_failure$
      BEGIN
        RAISE EXCEPTION 'forced flow run event insert failure';
      END;
      $test_failure$;
      CREATE TRIGGER flow_run_events_test_cancel_insert_failure
      BEFORE INSERT ON flow_run_events
      FOR EACH ROW
      EXECUTE FUNCTION elevenhouse_test_fail_cancel_event_insert();
    `);
  }

  async function removeFlowEventInsertFailure(): Promise<void> {
    await runtime.pool.query(`
      DROP TRIGGER IF EXISTS flow_run_events_test_cancel_insert_failure ON flow_run_events;
      DROP FUNCTION IF EXISTS elevenhouse_test_fail_cancel_event_insert();
    `);
  }
});

async function claimExecution(
  store: ReturnType<typeof createDrizzleFlowExecutionStore>,
  input: Parameters<ReturnType<typeof createDrizzleFlowExecutionStore>["claimNext"]>[0]
): Promise<FlowExecutionClaim> {
  const result = await store.claimNext(input);
  if (!result || result.status !== "claimed") raise("Expected claimed flow execution token");
  return result.claim;
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  assertDevelopmentDatabaseUrl(value);
  return value;
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function raise(message: string): never {
  throw new Error(message);
}

function errorChain(value: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = value;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join("\n");
}
