import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { flowGraphV2Schema, type FlowGraphV2 } from "@elevenhouse/contracts";
import {
  compileFlowGraphV2,
  createBuiltInFlowNodeExecutorRegistry,
  createFlowNodeExecutorRegistry,
  interpretFlowExecutionClaim,
  type FlowExecutionClaim,
  type FlowExecutionDecision
} from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { reconcileFlowExecutionSafety } from "../../../scripts/flow-execution-safety-reconciliation";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzleFlowExecutionStore } from "./drizzle-flow-execution-store";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_flow_execution_${randomUUID().replaceAll("-", "")}`;
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

const advancingGraph = flowGraphV2Schema.parse({
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
      id: "birth-data",
      kind: "birth_data_available",
      displayTitle: "Есть данные рождения?",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { purpose: "service_preparation" }
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Подготовка завершена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_prepared" }
    },
    {
      id: "suppressed",
      kind: "suppressed",
      displayTitle: "Нет данных",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { reasonCode: "birth_data_missing" }
    }
  ],
  edges: [
    {
      id: "manual-birth",
      sourceNodeId: "manual",
      targetNodeId: "birth-data",
      sourceHandle: "next"
    },
    {
      id: "birth-yes",
      sourceNodeId: "birth-data",
      targetNodeId: "completed",
      sourceHandle: "true"
    },
    {
      id: "birth-no",
      sourceNodeId: "birth-data",
      targetNodeId: "suppressed",
      sourceHandle: "false"
    }
  ]
});

function requireCapabilityManifest(input: FlowGraphV2) {
  const compiled = compileFlowGraphV2(input);
  if (!compiled.capabilityManifest) raise("Expected publishable integration graph");
  return compiled.capabilityManifest;
}

const capabilityManifest = requireCapabilityManifest(graph);
const advancingCapabilityManifest = requireCapabilityManifest(advancingGraph);

function createBirthDataRegistry() {
  return createFlowNodeExecutorRegistry([
    {
      kind: "birth_data_available",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      evaluate: async (node) => ({
        kind: "advance",
        sourceNodeId: node.id,
        sourceHandle: "true"
      })
    }
  ]);
}

describe("flow execution store Drizzle/PostgreSQL integration", () => {
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

  it("never rounds a later PostgreSQL transition instant behind an earlier microsecond write", async () => {
    const sample = await runtime.pool.query<{
      prior_at: string;
      transition_epoch_ms: string;
    }>(`
      SELECT '2026-08-03 19:51:59.390814+00'::timestamptz::text AS prior_at,
             (
               extract(epoch FROM '2026-08-03 19:51:59.390819+00'::timestamptz) * 1000
             )::text AS transition_epoch_ms
    `);
    const row = sample.rows[0] ?? raise("Expected PostgreSQL clock precision sample");
    const transitionAt = parseFlowDatabaseEpochMilliseconds(row.transition_epoch_ms);
    if (!transitionAt) raise("Expected parsed flow database transition instant");

    const comparison = await runtime.pool.query<{
      causally_ordered: boolean;
      millisecond_aligned: boolean;
    }>(
      `SELECT $1::timestamptz >= $2::timestamptz AS causally_ordered,
              mod(extract(microseconds FROM $1::timestamptz)::bigint, 1000) = 0
                AS millisecond_aligned`,
      [transitionAt.toISOString(), row.prior_at]
    );

    expect(comparison.rows[0]).toEqual({
      causally_ordered: true,
      millisecond_aligned: true
    });
  });

  it("allows exactly one concurrent claimant and atomically completes one terminal token", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claimResults = await Promise.all([
      store.claimNext({
        leaseOwner: "flows-worker-a",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      }),
      store.claimNext({
        leaseOwner: "flows-worker-b",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ]);
    const claimedResult = claimResults.find((candidate) => candidate?.status === "claimed");
    if (!claimedResult || claimedResult.status !== "claimed") raise("Expected one claim");
    const claim = claimedResult.claim;

    expect(claimResults.filter((candidate) => candidate !== null)).toHaveLength(1);
    expect(claim).toMatchObject({
      tokenId: fixture.tokenId,
      ownerUserId: fixture.ownerUserId,
      runId: fixture.runId,
      flowId: fixture.flowId,
      flowVersionId: fixture.flowVersionId,
      nodeId: "completed",
      nodeKind: "completed",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      attemptNumber: 1n,
      fencingToken: 1n
    });
    expect(new Date(claim.leaseExpiresAt).getTime()).toBeGreaterThan(
      new Date(claim.claimedAt).getTime()
    );

    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({
      status: "applied",
      traceSequence: 1n
    });
    await expect(store.finalize({ claim, decision })).resolves.toEqual({ status: "stale" });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({
      status: "completed",
      current_node_id: "completed",
      trace_sequence: "1"
    });
    expect(persisted.token).toMatchObject({
      state: "completed",
      fencing_token: "1",
      lease_owner: null,
      lease_expires_at: null,
      claimed_at: null
    });
    expect(persisted.attempts).toMatchObject([
      {
        node_id: "completed",
        executor_key: "completed:1:1",
        attempt_number: "1",
        fencing_token: "1",
        outcome: "completed",
        result_code: "consultation_prepared"
      }
    ]);
    expect(persisted.events).toMatchObject([
      {
        sequence: "1",
        event_type: "run_completed",
        node_id: "completed",
        summary: {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "terminal",
          nodeKind: "completed",
          reasonCode: "FLOW_GOAL_REACHED",
          resultCode: "consultation_prepared"
        }
      }
    ]);
    expect(persisted.events[0]?.attempt_id).toBe(persisted.attempts[0]?.id);
    await expect(store.finalize({ claim, decision })).resolves.toEqual({ status: "stale" });
    await expect(selectExecution(fixture.runId)).resolves.toEqual(persisted);
  });

  it("claims only persisted owners admitted by the canary owner scope", async () => {
    const excluded = await createTerminalFixture({
      availableAt: "2026-08-03T08:00:00.000Z"
    });
    const allowed = await createTerminalFixture({
      availableAt: "2026-08-03T08:01:00.000Z"
    });
    const store = createDrizzleFlowExecutionStore(runtime.database);

    const result = await store.claimNext({
      leaseOwner: "flows-worker-canary",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"],
      ownerScope: { kind: "allowlist", ownerUserIds: [allowed.ownerUserId] }
    });

    expect(result).toMatchObject({
      status: "claimed",
      claim: {
        ownerUserId: allowed.ownerUserId,
        tokenId: allowed.tokenId
      }
    });
    expect((await selectExecution(excluded.runId)).token).toMatchObject({
      state: "runnable",
      lease_owner: null
    });
  });

  it("rejects duplicate canary owners even when UUID casing differs", async () => {
    const store = createDrizzleFlowExecutionStore(runtime.database);

    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-invalid-canary",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: {
          kind: "allowlist",
          ownerUserIds: [
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"
          ]
        }
      })
    ).rejects.toThrow("Flow execution canary owner ids must be unique UUIDs");
  });

  it("globally recovers a removed canary owner without making it claimable", async () => {
    const removed = await createTerminalFixture({
      availableAt: "2026-08-03T08:00:00.000Z"
    });
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await claimExecution(store, {
      leaseOwner: "flows-worker-removed-owner",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"],
      ownerScope: { kind: "allowlist", ownerUserIds: [removed.ownerUserId] }
    });
    await expireClaimedToken(removed.tokenId);

    await expect(store.recoverExpired({ limit: 1 })).resolves.toMatchObject({
      recoveredCount: 1,
      retryScheduledCount: 1
    });

    expect((await selectExecution(removed.runId)).token).toMatchObject({
      state: "retry_scheduled",
      lease_owner: null
    });
    await runtime.pool.query(
      "update flow_execution_tokens set available_at = transaction_timestamp() - interval '1 second' where id = $1",
      [removed.tokenId]
    );
    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-after-removal",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: {
          kind: "allowlist",
          ownerUserIds: ["00000000-0000-4000-8000-000000000099"]
        }
      })
    ).resolves.toBeNull();
  });

  it("atomically advances one stable token to the persisted target node", async () => {
    const fixture = await createAdvancingFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-advance",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    expect(claim).toMatchObject({
      tokenId: fixture.tokenId,
      nodeId: "birth-data",
      nodeActivationSequence: 1n,
      attemptNumber: 1n,
      fencingToken: 1n
    });

    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBirthDataRegistry()
    });
    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({
      status: "applied",
      traceSequence: 1n
    });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({
      status: "running",
      current_node_id: "completed",
      trace_sequence: "1",
      completed_at: null
    });
    expect(persisted.token).toMatchObject({
      id: fixture.tokenId,
      node_id: "completed",
      node_kind: "completed",
      config_schema_version: 1,
      executor_contract_version: 1,
      executor_key: "completed:1:1",
      state: "runnable",
      node_activation_sequence: "2",
      attempt_counter: "0",
      fencing_token: "1",
      failure_disposition: null,
      failure_reason_code: null,
      terminal_at: null,
      quarantined_at: null,
      claimed_at: null,
      lease_owner: null,
      lease_expires_at: null
    });
    expect(persisted.attempts).toMatchObject([
      {
        node_id: "birth-data",
        executor_key: "birth_data_available:1:1",
        node_activation_sequence: "1",
        attempt_number: "1",
        fencing_token: "1",
        outcome: "advanced",
        result_code: "FLOW_TOKEN_ADVANCED"
      }
    ]);
    expect(persisted.events).toMatchObject([
      {
        sequence: "1",
        event_type: "token_advanced",
        node_id: "birth-data",
        summary: decision.trace
      }
    ]);
    expect(persisted.events[0]?.attempt_id).toBe(persisted.attempts[0]?.id);
  });

  it("resets node-local attempts while preserving the run-wide fence on the next activation", async () => {
    const fixture = await createAdvancingFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const firstClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-first-activation",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    const advanceDecision = await interpretFlowExecutionClaim({
      claim: firstClaim,
      registry: createBirthDataRegistry()
    });
    await expect(
      store.finalize({ claim: firstClaim, decision: advanceDecision })
    ).resolves.toMatchObject({
      status: "applied",
      traceSequence: 1n
    });

    const secondClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-second-activation",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    expect(secondClaim).toMatchObject({
      tokenId: fixture.tokenId,
      nodeId: "completed",
      nodeActivationSequence: 2n,
      attemptNumber: 1n,
      fencingToken: 2n
    });
    const terminalDecision = await interpretFlowExecutionClaim({
      claim: secondClaim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(
      store.finalize({ claim: secondClaim, decision: terminalDecision })
    ).resolves.toMatchObject({ status: "applied", traceSequence: 2n });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({
      status: "completed",
      current_node_id: "completed",
      trace_sequence: "2"
    });
    expect(persisted.token).toMatchObject({
      id: fixture.tokenId,
      state: "completed",
      node_activation_sequence: "2",
      attempt_counter: "1",
      fencing_token: "2"
    });
    expect(persisted.attempts).toMatchObject([
      {
        node_id: "birth-data",
        node_activation_sequence: "1",
        attempt_number: "1",
        fencing_token: "1",
        outcome: "advanced"
      },
      {
        node_id: "completed",
        node_activation_sequence: "2",
        attempt_number: "1",
        fencing_token: "2",
        outcome: "completed"
      }
    ]);
    expect(persisted.events).toMatchObject([
      { sequence: "1", event_type: "token_advanced" },
      { sequence: "2", event_type: "run_completed" }
    ]);
  });

  it("derives an advance target from the persisted definition instead of a worker claim", async () => {
    const fixture = await createAdvancingFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-persisted-target",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    const persistedDecision = await interpretFlowExecutionClaim({
      claim,
      registry: createBirthDataRegistry()
    });
    const forgedGraph = flowGraphV2Schema.parse({
      ...advancingGraph,
      edges: advancingGraph.edges.map((edge) => {
        if (edge.id === "birth-yes") return { ...edge, targetNodeId: "suppressed" };
        if (edge.id === "birth-no") return { ...edge, targetNodeId: "completed" };
        return edge;
      })
    });
    const forgedClaim: FlowExecutionClaim = {
      ...claim,
      graph: forgedGraph,
      capabilityManifest: requireCapabilityManifest(forgedGraph)
    };
    const forgedDecision = await interpretFlowExecutionClaim({
      claim: forgedClaim,
      registry: createBirthDataRegistry()
    });

    await expect(store.finalize({ claim: forgedClaim, decision: forgedDecision })).rejects.toThrow(
      "decision target does not match persisted graph"
    );
    const afterRejection = await selectExecution(fixture.runId);
    expect(afterRejection.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterRejection.token).toMatchObject({
      node_id: "birth-data",
      state: "claimed",
      node_activation_sequence: "1",
      attempt_counter: "1",
      fencing_token: "1"
    });
    expect(afterRejection.attempts).toEqual([]);
    expect(afterRejection.events).toEqual([]);

    await expect(store.finalize({ claim, decision: persistedDecision })).resolves.toMatchObject({
      status: "applied",
      traceSequence: 1n
    });
  });

  it("uses the post-validation claim clock for both token and run chronology", async () => {
    const fixture = await createTerminalFixture();
    const barrier = delayNextDatabaseTransaction();
    const store = createDrizzleFlowExecutionStore(runtime.database);

    try {
      const claimPromise = store.claimNext({
        leaseOwner: "flows-worker-post-validation-clock",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      });
      await barrier.entered.promise;
      await runtime.pool.query("select pg_sleep(0.05)");
      barrier.release.resolve();

      const result = await claimPromise;
      if (!result || result.status !== "claimed") raise("Expected one claim");
      const persisted = await selectExecution(fixture.runId);

      expect(persisted.token?.updated_at.toISOString()).toBe(result.claim.claimedAt);
      expect(persisted.run?.updated_at.toISOString()).toBe(result.claim.claimedAt);
    } finally {
      barrier.release.resolve();
      barrier.restore();
    }
  });

  it("rejects success finalization that acquires its token lock after the lease deadline", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-success-deadline",
      leaseDurationMs: 750,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    await expect(
      runAfterBlockedLeaseExpiry(fixture.tokenId, claim.leaseExpiresAt, () =>
        store.finalize({ claim, decision })
      )
    ).resolves.toEqual({ status: "stale" });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(persisted.token).toMatchObject({ state: "claimed", fencing_token: "1" });
    expect(persisted.attempts).toEqual([]);
    expect(persisted.events).toEqual([]);
  }, 10_000);

  it("rejects failure finalization that acquires its token lock after the lease deadline", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-failure-deadline",
      leaseDurationMs: 750,
      executorKeys: ["completed:1:1"]
    });

    await expect(
      runAfterBlockedLeaseExpiry(fixture.tokenId, claim.leaseExpiresAt, () =>
        store.finalizeFailure({
          claim,
          failure: {
            classification: "retryable",
            reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE"
          }
        })
      )
    ).resolves.toEqual({ status: "stale" });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(persisted.token).toMatchObject({ state: "claimed", fencing_token: "1" });
    expect(persisted.attempts).toEqual([]);
    expect(persisted.events).toEqual([]);
  }, 10_000);

  it("skips a locked earlier token instead of blocking later runnable work", async () => {
    const earlier = await createTerminalFixture({ availableAt: "2026-08-03T08:00:00.000Z" });
    const later = await createTerminalFixture({ availableAt: "2026-08-03T08:01:00.000Z" });
    const locker = await runtime.pool.connect();
    const store = createDrizzleFlowExecutionStore(runtime.database);

    try {
      await locker.query("begin");
      await locker.query("select id from flow_execution_tokens where id = $1 for update", [
        earlier.tokenId
      ]);

      const claimPromise = store.claimNext({
        leaseOwner: "flows-worker-skip-locked",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      });
      const result = await Promise.race([
        claimPromise,
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 1_000))
      ]);

      expect(result).not.toBe("timeout");
      expect(result).toMatchObject({ status: "claimed", claim: { tokenId: later.tokenId } });
      await locker.query("rollback");
      await claimPromise;
    } finally {
      await locker.query("rollback").catch(() => undefined);
      locker.release();
      await runtime.pool.query("delete from users where id = any($1::uuid[])", [
        [earlier.ownerUserId, later.ownerUserId]
      ]);
    }
  });

  it("quarantines a token pinned to unsupported interpreter semantics", async () => {
    const fixture = await createTerminalFixture({
      capabilityManifest: {
        ...capabilityManifest,
        executionSemanticsVersion: "flow-interpreter.v2"
      }
    });
    const store = createDrizzleFlowExecutionStore(runtime.database);

    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-unsupported-interpreter",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toMatchObject({
      status: "quarantined",
      tokenId: fixture.tokenId,
      reasonCode: "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID"
    });
    const persisted = await selectExecution(fixture.runId);
    expect(persisted.token).toMatchObject({
      state: "failed",
      attempt_counter: "0",
      fencing_token: "0",
      failure_disposition: "quarantined",
      failure_reason_code: "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID"
    });
    expect(persisted.run).toMatchObject({ status: "failed_terminal", trace_sequence: "1" });
    expect(persisted.attempts).toEqual([]);
    expect(persisted.events).toMatchObject([
      { sequence: "1", event_type: "run_failed", attempt_id: null }
    ]);
  });

  it("uses a post-lock clock when quarantining poison work", async () => {
    const fixture = await createTerminalFixture({
      capabilityManifest: {
        ...capabilityManifest,
        executionSemanticsVersion: "flow-interpreter.v2"
      }
    });
    const barrier = delayNextDatabaseTransaction();
    const store = createDrizzleFlowExecutionStore(runtime.database);

    try {
      const quarantinePromise = store.claimNext({
        leaseOwner: "flows-worker-poison-clock",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      });
      await barrier.entered.promise;
      await runtime.pool.query("select pg_sleep(0.05)");
      const newerState = await runtime.pool.query<{ updated_at: Date }>(
        "update flow_execution_tokens set updated_at = clock_timestamp() where id = $1 returning updated_at",
        [fixture.tokenId]
      );
      barrier.release.resolve();

      await expect(quarantinePromise).resolves.toMatchObject({ status: "quarantined" });
      const persisted = await selectExecution(fixture.runId);
      const priorUpdatedAt = newerState.rows[0]?.updated_at ?? raise("Expected token update time");

      expect(persisted.token?.terminal_at.getTime()).toBeGreaterThanOrEqual(
        priorUpdatedAt.getTime()
      );
      expect(persisted.token?.updated_at.getTime()).toBeGreaterThanOrEqual(
        priorUpdatedAt.getTime()
      );
      expect(persisted.events[0]?.occurred_at.getTime()).toBeGreaterThanOrEqual(
        priorUpdatedAt.getTime()
      );
    } finally {
      barrier.release.resolve();
      barrier.restore();
    }
  });

  it("quarantines a graph-manifest snapshot whose executor set was truncated", async () => {
    const fixture = await createTerminalFixture({
      capabilityManifest: {
        ...capabilityManifest,
        nodeExecutors: []
      }
    });
    const store = createDrizzleFlowExecutionStore(runtime.database);

    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-manifest-preflight",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toMatchObject({
      status: "quarantined",
      reasonCode: "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID"
    });
    expect((await selectExecution(fixture.runId)).token).toMatchObject({
      state: "failed",
      attempt_counter: "0",
      fencing_token: "0",
      failure_disposition: "quarantined"
    });
  });

  it("quarantines a token whose pinned graph node metadata disagrees", async () => {
    const fixture = await createTerminalFixture({
      graph: {
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === "completed" ? { ...node, configSchemaVersion: 2 } : node
        )
      }
    });
    const store = createDrizzleFlowExecutionStore(runtime.database);

    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-graph-preflight",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toMatchObject({
      status: "quarantined",
      reasonCode: "FLOW_PINNED_GRAPH_INVALID"
    });
    expect((await selectExecution(fixture.runId)).token).toMatchObject({
      state: "failed",
      attempt_counter: "0",
      fencing_token: "0",
      failure_disposition: "quarantined"
    });
  });

  it("quarantines an invalid pinned graph before persisting a lease", async () => {
    const fixture = await createTerminalFixture({
      graph: {
        ...graph,
        nodes: graph.nodes.map((node) => (node.id === "completed" ? { ...node, config: {} } : node))
      }
    });
    const store = createDrizzleFlowExecutionStore(runtime.database);

    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-graph-validation",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toMatchObject({
      status: "quarantined",
      reasonCode: "FLOW_PINNED_GRAPH_INVALID"
    });
    expect((await selectExecution(fixture.runId)).token).toMatchObject({
      state: "failed",
      attempt_counter: "0",
      fencing_token: "0",
      lease_owner: null,
      failure_disposition: "quarantined"
    });
  });

  it("removes an earlier poison token so the next runnable token can be claimed", async () => {
    const poison = await createTerminalFixture({
      availableAt: "2026-08-03T08:00:00.000Z",
      graph: {
        ...graph,
        nodes: graph.nodes.map((node) => (node.id === "completed" ? { ...node, config: {} } : node))
      }
    });
    const healthy = await createTerminalFixture({ availableAt: "2026-08-03T08:01:00.000Z" });
    const store = createDrizzleFlowExecutionStore(runtime.database);

    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-poison-first",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toMatchObject({ status: "quarantined", tokenId: poison.tokenId });
    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-after-poison",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toMatchObject({
      status: "claimed",
      claim: { tokenId: healthy.tokenId }
    });
  });

  it("persists a typed retry, respects its database due time and reclaims it", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const firstClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-typed-retry-1",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });

    const result = await store.finalizeFailure({
      claim: firstClaim,
      failure: {
        classification: "retryable",
        reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE"
      }
    });
    expect(result).toMatchObject({
      status: "applied",
      disposition: "retry_scheduled",
      traceSequence: 1n
    });
    if (result.status !== "applied" || !result.availableAt) raise("Expected retry due time");
    expect(new Date(result.availableAt).getTime()).toBeGreaterThan(Date.now());
    await expect(
      store.claimNext({
        leaseOwner: "flows-worker-too-early",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"],
        ownerScope: { kind: "all" }
      })
    ).resolves.toBeNull();

    const retryState = await selectExecution(fixture.runId);
    expect(retryState.run).toMatchObject({ status: "failed_retryable", trace_sequence: "1" });
    expect(retryState.token).toMatchObject({
      state: "retry_scheduled",
      failure_disposition: "retry_scheduled",
      failure_reason_code: "FLOW_NODE_EXECUTION_RETRYABLE",
      max_attempts: 3
    });
    expect(retryState.attempts).toMatchObject([
      { outcome: "retry_scheduled", result_code: "FLOW_EXECUTION_RETRY_SCHEDULED" }
    ]);
    expect(retryState.events).toMatchObject([
      { event_type: "token_retry_scheduled", sequence: "1" }
    ]);

    await runtime.pool.query(
      "update flow_execution_tokens set available_at = transaction_timestamp() - interval '1 second' where id = $1",
      [fixture.tokenId]
    );
    const retryClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-typed-retry-2",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    expect(retryClaim).toMatchObject({ attemptNumber: 2n, fencingToken: 2n });
    expect((await selectExecution(fixture.runId)).token).toMatchObject({
      state: "claimed",
      failure_disposition: null,
      failure_reason_code: null
    });
  });

  it("enforces the exact retry V1 tuple and state-specific counter invariants", async () => {
    const fixture = await createTerminalFixture();

    await expect(
      runtime.pool.query("update flow_execution_tokens set max_attempts = 20 where id = $1", [
        fixture.tokenId
      ])
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'claimed', claimed_at = transaction_timestamp(),
                lease_owner = 'invalid-zero-claim',
                lease_expires_at = transaction_timestamp() + interval '1 minute'
          where id = $1`,
        [fixture.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'retry_scheduled', attempt_counter = 3, fencing_token = 3,
                failure_disposition = 'retry_scheduled',
                failure_reason_code = 'FLOW_NODE_EXECUTION_RETRYABLE'
          where id = $1`,
        [fixture.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'retry_scheduled', attempt_counter = 1, fencing_token = 1,
                failure_disposition = 'retry_scheduled',
                failure_reason_code = 'FLOW_NODE_EXECUTION_REJECTED'
          where id = $1`,
        [fixture.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });

    const missingRetryDisposition = await createTerminalFixture();
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'retry_scheduled', attempt_counter = 1, fencing_token = 1,
                failure_disposition = null,
                failure_reason_code = 'FLOW_NODE_EXECUTION_RETRYABLE'
          where id = $1`,
        [missingRetryDisposition.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });

    const missingRetryReason = await createTerminalFixture();
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'retry_scheduled', attempt_counter = 1, fencing_token = 1,
                failure_disposition = 'retry_scheduled', failure_reason_code = null
          where id = $1`,
        [missingRetryReason.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });

    const missingTerminalReason = await createTerminalFixture();
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'failed', attempt_counter = 1, fencing_token = 1,
                failure_disposition = 'failed_terminal', failure_reason_code = null,
                terminal_at = transaction_timestamp()
          where id = $1`,
        [missingTerminalReason.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("quarantines a claimable token whose persisted failure metadata is incomplete", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await runtime.pool.query(`
      ALTER TABLE flow_execution_tokens
        DROP CONSTRAINT flow_execution_tokens_failure_state_check
    `);

    try {
      await runtime.pool.query(
        `update flow_execution_tokens
            set state = 'retry_scheduled', attempt_counter = 1, fencing_token = 1,
                available_at = transaction_timestamp() - interval '1 second',
                failure_disposition = null, failure_reason_code = null
          where id = $1`,
        [fixture.tokenId]
      );
      await runtime.pool.query("update flow_runs set status = 'failed_retryable' where id = $1", [
        fixture.runId
      ]);

      await expect(
        store.claimNext({
          leaseOwner: "flows-worker-invalid-retry-metadata",
          leaseDurationMs: 30_000,
          executorKeys: ["completed:1:1"],
          ownerScope: { kind: "all" }
        })
      ).resolves.toMatchObject({ status: "quarantined", tokenId: fixture.tokenId });

      const persisted = await selectExecution(fixture.runId);
      expect(persisted.token).toMatchObject({
        state: "failed",
        failure_disposition: "quarantined",
        failure_reason_code: "FLOW_TOKEN_RUNTIME_STATE_INVALID"
      });
      expect(persisted.attempts).toEqual([]);
    } finally {
      await runtime.pool.query("delete from users where id = $1", [fixture.ownerUserId]);
      await restoreFailureStateConstraint();
    }
  });

  it("allows one defensive retry for an unknown failure, then fails terminally", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const firstClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-unknown-1",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await expect(
      store.finalizeFailure({
        claim: firstClaim,
        failure: {
          classification: "retryable",
          reasonCode: "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE"
        }
      })
    ).resolves.toMatchObject({ disposition: "retry_scheduled" });

    await runtime.pool.query(
      "update flow_execution_tokens set available_at = transaction_timestamp() - interval '1 second' where id = $1",
      [fixture.tokenId]
    );
    const secondClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-unknown-2",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await expect(
      store.finalizeFailure({
        claim: secondClaim,
        failure: {
          classification: "retryable",
          reasonCode: "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE"
        }
      })
    ).resolves.toMatchObject({
      disposition: "failed_terminal",
      availableAt: null,
      traceSequence: 2n
    });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "failed_terminal", trace_sequence: "2" });
    expect(persisted.token).toMatchObject({
      state: "failed",
      attempt_counter: "2",
      failure_disposition: "failed_terminal",
      failure_reason_code: "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE",
      quarantined_at: null
    });
    expect(persisted.attempts.map((attempt) => attempt.outcome)).toEqual([
      "retry_scheduled",
      "failed"
    ]);
  });

  it("quarantines a deterministic post-claim integrity failure and fences stale success", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-integrity-failure",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    await expect(
      store.finalizeFailure({
        claim,
        failure: {
          classification: "permanent",
          reasonCode: "FLOW_RUNTIME_TRACE_INVALID"
        }
      })
    ).resolves.toMatchObject({ disposition: "quarantined", traceSequence: 1n });
    await expect(store.finalize({ claim, decision })).resolves.toEqual({ status: "stale" });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.token).toMatchObject({
      state: "failed",
      failure_disposition: "quarantined",
      failure_reason_code: "FLOW_RUNTIME_TRACE_INVALID"
    });
    expect(persisted.token?.quarantined_at).not.toBeNull();
    expect(JSON.stringify(persisted)).not.toContain("private");
  });

  it("exhausts the immutable three-attempt budget with bounded equal jitter", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);

    for (const attemptNumber of [1, 2] as const) {
      const claim = await claimExecution(store, {
        leaseOwner: `flows-worker-budget-${attemptNumber}`,
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"]
      });
      const result = await store.finalizeFailure({
        claim,
        failure: {
          classification: "retryable",
          reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE"
        }
      });
      expect(result).toMatchObject({
        status: "applied",
        disposition: "retry_scheduled",
        traceSequence: BigInt(attemptNumber)
      });

      const retryState = await selectExecution(fixture.runId);
      const availableAt = retryState.token?.available_at as Date | undefined;
      const updatedAt = retryState.token?.updated_at as Date | undefined;
      if (!availableAt || !updatedAt) raise("Expected persisted retry timestamps");
      const delayMs = availableAt.getTime() - updatedAt.getTime();
      const cappedDelayMs = 1_000 * 2 ** (attemptNumber - 1);
      expect(delayMs).toBeGreaterThanOrEqual(cappedDelayMs / 2);
      expect(delayMs).toBeLessThanOrEqual(cappedDelayMs);

      await runtime.pool.query(
        "update flow_execution_tokens set available_at = transaction_timestamp() - interval '1 second' where id = $1",
        [fixture.tokenId]
      );
    }

    const finalClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-budget-3",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    expect(finalClaim).toMatchObject({ attemptNumber: 3n, fencingToken: 3n });
    await expireClaimedToken(fixture.tokenId);

    await expect(store.recoverExpired({ limit: 10 })).resolves.toEqual({
      recoveredCount: 1,
      retryScheduledCount: 0,
      failedTerminalCount: 1,
      quarantinedCount: 0
    });
    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "failed_terminal", trace_sequence: "3" });
    expect(persisted.token).toMatchObject({
      state: "failed",
      attempt_counter: "3",
      failure_disposition: "failed_terminal",
      failure_reason_code: "FLOW_TOKEN_LEASE_EXPIRED",
      fencing_token: "4"
    });
    expect(
      persisted.attempts.map(({ attempt_number, fencing_token, outcome, result_code }) => ({
        attempt_number,
        fencing_token,
        outcome,
        result_code
      }))
    ).toEqual([
      {
        attempt_number: "1",
        fencing_token: "1",
        outcome: "retry_scheduled",
        result_code: "FLOW_EXECUTION_RETRY_SCHEDULED"
      },
      {
        attempt_number: "2",
        fencing_token: "2",
        outcome: "retry_scheduled",
        result_code: "FLOW_EXECUTION_RETRY_SCHEDULED"
      },
      {
        attempt_number: "3",
        fencing_token: "3",
        outcome: "failed",
        result_code: "FLOW_EXECUTION_RETRY_EXHAUSTED"
      }
    ]);
    expect(persisted.events.map(({ sequence, event_type }) => ({ sequence, event_type }))).toEqual([
      { sequence: "1", event_type: "token_retry_scheduled" },
      { sequence: "2", event_type: "token_retry_scheduled" },
      { sequence: "3", event_type: "run_failed" }
    ]);
  });

  it("quarantines an invalid expired claim instead of poisoning every recovery sweep", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await runtime.pool.query(`
      ALTER TABLE flow_execution_tokens
        DROP CONSTRAINT flow_execution_tokens_attempt_counter_check,
        DROP CONSTRAINT flow_execution_tokens_fencing_token_check,
        DROP CONSTRAINT IF EXISTS flow_execution_tokens_counter_state_check
    `);

    try {
      await runtime.pool.query(
        `update flow_execution_tokens
            set state = 'claimed', claimed_at = transaction_timestamp() - interval '1 minute',
                lease_owner = 'flows-worker-invalid-recovery',
                lease_expires_at = transaction_timestamp() - interval '1 second'
          where id = $1`,
        [fixture.tokenId]
      );

      await expect(store.recoverExpired({ limit: 10 })).resolves.toEqual({
        recoveredCount: 1,
        retryScheduledCount: 0,
        failedTerminalCount: 0,
        quarantinedCount: 1
      });
      const persisted = await selectExecution(fixture.runId);
      expect(persisted.run).toMatchObject({ status: "failed_terminal", trace_sequence: "1" });
      expect(persisted.token).toMatchObject({
        state: "failed",
        attempt_counter: "0",
        failure_disposition: "quarantined",
        failure_reason_code: "FLOW_TOKEN_RUNTIME_STATE_INVALID"
      });
      expect(persisted.attempts).toEqual([]);
      expect(persisted.events).toMatchObject([
        {
          event_type: "run_failed",
          attempt_id: null,
          summary: { reasonCode: "FLOW_TOKEN_RUNTIME_STATE_INVALID" }
        }
      ]);
    } finally {
      await runtime.pool.query("delete from users where id = $1", [fixture.ownerUserId]);
      await runtime.pool.query(`
        ALTER TABLE flow_execution_tokens
          ADD CONSTRAINT flow_execution_tokens_attempt_counter_check CHECK (
            attempt_counter BETWEEN 0 AND max_attempts
          ),
          ADD CONSTRAINT flow_execution_tokens_fencing_token_check CHECK (
            fencing_token >= attempt_counter
          ),
          ADD CONSTRAINT flow_execution_tokens_counter_state_check CHECK (
            (state NOT IN ('runnable', 'retry_scheduled') OR attempt_counter < max_attempts)
            AND (state NOT IN ('claimed', 'retry_scheduled') OR attempt_counter > 0)
          )
      `);
    }
  });

  it("quarantines an expired claim whose claim timestamp is after its lease deadline", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await runtime.pool.query(`
      ALTER TABLE flow_execution_tokens
        DROP CONSTRAINT flow_execution_tokens_lease_state_check
    `);

    try {
      await runtime.pool.query(
        `update flow_execution_tokens
            set state = 'claimed',
                claimed_at = transaction_timestamp() + interval '1 minute',
                lease_owner = 'flows-worker-invalid-lease-order',
                lease_expires_at = transaction_timestamp() - interval '1 second',
                attempt_counter = 1, fencing_token = 1
          where id = $1`,
        [fixture.tokenId]
      );

      await expect(store.recoverExpired({ limit: 10 })).resolves.toEqual({
        recoveredCount: 1,
        retryScheduledCount: 0,
        failedTerminalCount: 0,
        quarantinedCount: 1
      });
      const persisted = await selectExecution(fixture.runId);
      expect(persisted.token).toMatchObject({
        state: "failed",
        attempt_counter: "1",
        failure_disposition: "quarantined",
        failure_reason_code: "FLOW_TOKEN_RUNTIME_STATE_INVALID"
      });
      expect(persisted.attempts).toEqual([]);
      expect(persisted.events).toMatchObject([
        {
          event_type: "run_failed",
          attempt_id: null,
          summary: { reasonCode: "FLOW_TOKEN_RUNTIME_STATE_INVALID" }
        }
      ]);
    } finally {
      await runtime.pool.query("delete from users where id = $1", [fixture.ownerUserId]);
      await restoreLeaseStateConstraint();
    }
  });

  it("quarantines a claimed token whose entire persisted lease clock is future-dated", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await runtime.pool.query(
      `update flow_execution_tokens
          set state = 'claimed',
              claimed_at = clock_timestamp() + interval '1 minute',
              lease_owner = 'flows-worker-future-clock',
              lease_expires_at = clock_timestamp() + interval '2 minutes',
              attempt_counter = 1, fencing_token = 1,
              updated_at = clock_timestamp() + interval '1 minute'
        where id = $1`,
      [fixture.tokenId]
    );

    await expect(store.recoverExpired({ limit: 10 })).resolves.toEqual({
      recoveredCount: 1,
      retryScheduledCount: 0,
      failedTerminalCount: 0,
      quarantinedCount: 1
    });
    const persisted = await selectExecution(fixture.runId);
    expect(persisted.token).toMatchObject({
      state: "failed",
      failure_disposition: "quarantined",
      failure_reason_code: "FLOW_TOKEN_RUNTIME_STATE_INVALID"
    });
    expect(persisted.attempts).toEqual([]);
  });

  it("does not recover a live claim committed after the recovery transaction began", async () => {
    const fixture = await createTerminalFixture();
    const barrier = delayNextDatabaseTransaction();
    const recoveryStore = createDrizzleFlowExecutionStore(runtime.database);

    try {
      const recoveryPromise = recoveryStore.recoverExpired({ limit: 10 });
      await barrier.entered.promise;
      await runtime.pool.query("select pg_sleep(0.05)");
      const claim = await claimExecution(createDrizzleFlowExecutionStore(runtime.database), {
        leaseOwner: "flows-worker-after-recovery-start",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"]
      });
      barrier.release.resolve();

      await expect(recoveryPromise).resolves.toEqual({
        recoveredCount: 0,
        retryScheduledCount: 0,
        failedTerminalCount: 0,
        quarantinedCount: 0
      });
      const persisted = await selectExecution(fixture.runId);
      expect(persisted.token).toMatchObject({
        state: "claimed",
        attempt_counter: "1",
        fencing_token: claim.fencingToken.toString(),
        lease_owner: claim.leaseOwner
      });
      expect(persisted.attempts).toEqual([]);
      expect(persisted.events).toEqual([]);
    } finally {
      barrier.release.resolve();
      barrier.restore();
    }
  });

  it("recovers one expired lease, increments its fence and rejects the stale worker", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const staleClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-stale",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await expireClaimedToken(fixture.tokenId);

    const recovered = await Promise.all([
      store.recoverExpired({ limit: 10 }),
      store.recoverExpired({ limit: 10 })
    ]);
    expect(recovered.reduce((sum, value) => sum + value.recoveredCount, 0)).toBe(1);
    expect(recovered.reduce((sum, value) => sum + value.retryScheduledCount, 0)).toBe(1);
    await runtime.pool.query(
      "update flow_execution_tokens set available_at = transaction_timestamp() - interval '1 second' where id = $1",
      [fixture.tokenId]
    );

    const freshClaim = await claimExecution(store, {
      leaseOwner: "flows-worker-fresh",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    expect(freshClaim.fencingToken).toBe(3n);
    expect(freshClaim.attemptNumber).toBe(2n);

    const staleDecision = await interpretFlowExecutionClaim({
      claim: staleClaim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(store.finalize({ claim: staleClaim, decision: staleDecision })).resolves.toEqual({
      status: "stale"
    });

    const freshDecision = await interpretFlowExecutionClaim({
      claim: freshClaim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(
      store.finalize({ claim: freshClaim, decision: freshDecision })
    ).resolves.toMatchObject({
      status: "applied",
      traceSequence: 2n
    });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "completed", trace_sequence: "2" });
    expect(persisted.attempts).toMatchObject([
      { attempt_number: "1", fencing_token: "1", outcome: "lease_expired" },
      { attempt_number: "2", fencing_token: "3", outcome: "completed" }
    ]);
    expect(persisted.events).toMatchObject([
      { sequence: "1", event_type: "token_lease_expired" },
      { sequence: "2", event_type: "run_completed" }
    ]);
  });

  it("rejects finalize after the database lease deadline before recovery runs", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-expired-before-recovery",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expireClaimedToken(fixture.tokenId);

    await expect(store.finalize({ claim, decision })).resolves.toEqual({ status: "stale" });

    const afterStaleFinalize = await selectExecution(fixture.runId);
    expect(afterStaleFinalize.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterStaleFinalize.token).toMatchObject({
      state: "claimed",
      lease_owner: "flows-worker-expired-before-recovery",
      attempt_counter: "1",
      fencing_token: "1"
    });
    expect(afterStaleFinalize.attempts).toEqual([]);
    expect(afterStaleFinalize.events).toEqual([]);
    await expect(store.recoverExpired({ limit: 10 })).resolves.toMatchObject({
      recoveredCount: 1,
      retryScheduledCount: 1,
      failedTerminalCount: 0
    });
  });

  it("treats owner, lease, activation, fence and node metadata mismatches as stale with zero writes", async () => {
    const fixture = await createTerminalFixture();
    const otherOwnerUserId = await createUser();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-cas",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    await expect(
      store.finalize({ claim: { ...claim, ownerUserId: otherOwnerUserId }, decision })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalize({ claim: { ...claim, leaseOwner: "flows-worker-other" }, decision })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalize({
        claim: { ...claim, nodeActivationSequence: claim.nodeActivationSequence + 1n },
        decision
      })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalize({ claim: { ...claim, fencingToken: claim.fencingToken + 1n }, decision })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalize({
        claim: { ...claim, nodeId: "different-node" },
        decision: { ...decision, sourceNodeId: "different-node" }
      })
    ).resolves.toEqual({ status: "stale" });

    const afterStaleWrites = await selectExecution(fixture.runId);
    expect(afterStaleWrites.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterStaleWrites.token).toMatchObject({ state: "claimed", fencing_token: "1" });
    expect(afterStaleWrites.attempts).toEqual([]);
    expect(afterStaleWrites.events).toEqual([]);
    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({ status: "applied" });
  });

  it("treats failure owner, lease, activation, fence and node mismatches as stale with zero writes", async () => {
    const fixture = await createTerminalFixture();
    const otherOwnerUserId = await createUser();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-failure-cas",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const failure = {
      classification: "retryable" as const,
      reasonCode: "FLOW_NODE_EXECUTION_RETRYABLE" as const
    };

    await expect(
      store.finalizeFailure({ claim: { ...claim, ownerUserId: otherOwnerUserId }, failure })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalizeFailure({ claim: { ...claim, leaseOwner: "flows-worker-other" }, failure })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalizeFailure({
        claim: { ...claim, nodeActivationSequence: claim.nodeActivationSequence + 1n },
        failure
      })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalizeFailure({
        claim: { ...claim, fencingToken: claim.fencingToken + 1n },
        failure
      })
    ).resolves.toEqual({ status: "stale" });
    await expect(
      store.finalizeFailure({ claim: { ...claim, nodeId: "different-node" }, failure })
    ).resolves.toEqual({ status: "stale" });

    const afterStaleWrites = await selectExecution(fixture.runId);
    expect(afterStaleWrites.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterStaleWrites.token).toMatchObject({ state: "claimed", fencing_token: "1" });
    expect(afterStaleWrites.attempts).toEqual([]);
    expect(afterStaleWrites.events).toEqual([]);
    await expect(store.finalizeFailure({ claim, failure })).resolves.toMatchObject({
      status: "applied",
      disposition: "retry_scheduled"
    });
  });

  it("persists attempt audit lineage from the locked database row", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-db-audit",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    const callerAlteredClaim = {
      ...claim,
      attemptNumber: claim.attemptNumber + 100n,
      claimedAt: "2000-01-01T00:00:00.000Z"
    };

    await expect(store.finalize({ claim: callerAlteredClaim, decision })).resolves.toMatchObject({
      status: "applied"
    });

    const persisted = await selectExecution(fixture.runId);
    expect(persisted.attempts).toHaveLength(1);
    expect(persisted.attempts[0]).toMatchObject({
      attempt_number: "1",
      fencing_token: "1"
    });
    expect(persisted.attempts[0]?.started_at.toISOString()).toBe(claim.claimedAt);
  });

  it("rejects attempt history outside the retry budget or its fence lineage", async () => {
    const overBudgetFixture = await createTerminalFixture();
    const overBudgetClaim = await claimExecution(
      createDrizzleFlowExecutionStore(runtime.database),
      {
        leaseOwner: "flows-worker-attempt-budget",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"]
      }
    );
    await expect(
      insertRawCompletedAttempt(overBudgetFixture, overBudgetClaim, 4, 4)
    ).rejects.toMatchObject({ code: "23514" });

    const invalidFenceFixture = await createTerminalFixture();
    const invalidFenceClaim = await claimExecution(
      createDrizzleFlowExecutionStore(runtime.database),
      {
        leaseOwner: "flows-worker-attempt-fence",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"]
      }
    );
    await expect(
      insertRawCompletedAttempt(invalidFenceFixture, invalidFenceClaim, 2, 1)
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces positive activation identity and node-local attempt uniqueness", async () => {
    const invalidTokenFixture = await createTerminalFixture();
    await expect(
      runtime.pool.query(
        "update flow_execution_tokens set node_activation_sequence = 0 where id = $1",
        [invalidTokenFixture.tokenId]
      )
    ).rejects.toMatchObject({ code: "23514" });

    const invalidAttemptClaim = await claimExecution(
      createDrizzleFlowExecutionStore(runtime.database),
      {
        leaseOwner: "flows-worker-invalid-activation",
        leaseDurationMs: 30_000,
        executorKeys: ["completed:1:1"]
      }
    );
    await expect(
      insertRawCompletedAttempt(
        invalidTokenFixture,
        { ...invalidAttemptClaim, nodeActivationSequence: 0n },
        1,
        1
      )
    ).rejects.toMatchObject({ code: "23514" });

    await insertRawCompletedAttempt(invalidTokenFixture, invalidAttemptClaim, 1, 1);
    await expect(
      insertRawCompletedAttempt(invalidTokenFixture, invalidAttemptClaim, 1, 2)
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "flow_execution_attempts_token_activation_attempt_unique"
    });
  });

  it("allows only one causal run event for each execution attempt", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-one-causal-event",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await store.finalize({ claim, decision });
    const persisted = await selectExecution(fixture.runId);
    const attemptId = persisted.attempts[0]?.id ?? raise("Expected persisted attempt");

    await expect(
      runtime.pool.query(
        `insert into flow_run_events
          (owner_user_id, flow_run_id, sequence, event_type, node_id, attempt_id, summary, occurred_at)
         values ($1, $2, 2, 'run_completed', 'completed', $3, $4, clock_timestamp())`,
        [fixture.ownerUserId, fixture.runId, attemptId, decision.trace]
      )
    ).rejects.toMatchObject({ code: "23505", constraint: "flow_run_events_attempt_unique" });
  });

  it("rejects malformed advanced attempt and event traces", async () => {
    const fixture = await createAdvancingFixture();
    const claim = await claimExecution(createDrizzleFlowExecutionStore(runtime.database), {
      leaseOwner: "flows-worker-malformed-advance",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBirthDataRegistry()
    });
    const attemptId = randomUUID();
    const malformedAttemptTrace = { ...decision.trace, sourceHandle: true };
    const malformedEventTrace = { ...decision.trace, selectedEdgeId: 123 };
    const insertAttempt = (trace: Record<string, unknown>) =>
      runtime.pool.query(
        `insert into flow_execution_attempts
          (id, owner_user_id, flow_run_id, token_id, flow_version_id, node_id, executor_key,
           node_activation_sequence, attempt_number, fencing_token, lease_owner, outcome,
           result_code, trace_summary, started_at, completed_at, created_at)
         values ($1, $2, $3, $4, $5, 'birth-data', 'birth_data_available:1:1', 1, 1, 1,
           $6, 'advanced', 'FLOW_TOKEN_ADVANCED', $7, $8, clock_timestamp(), clock_timestamp())`,
        [
          attemptId,
          fixture.ownerUserId,
          fixture.runId,
          fixture.tokenId,
          fixture.flowVersionId,
          claim.leaseOwner,
          trace,
          claim.claimedAt
        ]
      );

    await expect(insertAttempt(malformedAttemptTrace)).rejects.toMatchObject({ code: "23514" });
    await insertAttempt(decision.trace);
    await expect(
      runtime.pool.query(
        `insert into flow_run_events
          (owner_user_id, flow_run_id, sequence, event_type, node_id, attempt_id, summary, occurred_at)
         values ($1, $2, 1, 'token_advanced', 'birth-data', $3, $4, clock_timestamp())`,
        [fixture.ownerUserId, fixture.runId, attemptId, malformedEventTrace]
      )
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects completed token and audit state for a non-terminal node", async () => {
    const fixture = await createAdvancingFixture();
    await expect(
      runtime.pool.query(
        `update flow_execution_tokens
            set state = 'completed', terminal_at = clock_timestamp()
          where id = $1`,
        [fixture.tokenId]
      )
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "flow_execution_tokens_completed_node_check"
    });

    const claim = await claimExecution(createDrizzleFlowExecutionStore(runtime.database), {
      leaseOwner: "flows-worker-invalid-terminal-audit",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    const invalidTerminalTrace = {
      schemaVersion: "flow-runtime-trace.v1",
      outcome: "terminal",
      nodeKind: "birth_data_available",
      reasonCode: "FLOW_GOAL_REACHED",
      resultCode: "invalid_early_completion"
    };
    await expect(
      runtime.pool.query(
        `insert into flow_execution_attempts
          (owner_user_id, flow_run_id, token_id, flow_version_id, node_id, executor_key,
           node_activation_sequence, attempt_number, fencing_token, lease_owner, outcome,
           result_code, trace_summary, started_at, completed_at, created_at)
         values ($1, $2, $3, $4, 'birth-data', 'birth_data_available:1:1', 1, 1, 1,
           $5, 'completed', 'invalid_early_completion', $6, $7, clock_timestamp(),
           clock_timestamp())`,
        [
          fixture.ownerUserId,
          fixture.runId,
          fixture.tokenId,
          fixture.flowVersionId,
          claim.leaseOwner,
          invalidTerminalTrace,
          claim.claimedAt
        ]
      )
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "flow_execution_attempts_trace_summary_schema_check"
    });
  });

  it("rejects non-redacted trace data before changing the claimed token", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-atomic",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    const invalidDecision = {
      ...decision,
      trace: {
        ...decision.trace,
        birthData: { date: "1990-01-02", place: "Moscow" }
      }
    } as unknown as FlowExecutionDecision;

    await expect(store.finalize({ claim, decision: invalidDecision })).rejects.toThrow(
      "FLOW_RUNTIME_TRACE_INVALID"
    );
    const afterFailure = await selectExecution(fixture.runId);
    expect(afterFailure.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterFailure.token).toMatchObject({
      state: "claimed",
      lease_owner: "flows-worker-atomic",
      fencing_token: "1"
    });
    expect(afterFailure.attempts).toEqual([]);
    expect(afterFailure.events).toEqual([]);

    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({ status: "applied" });
  });

  it("rejects an unknown decision discriminator before opening a database transaction", async () => {
    await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-unknown-decision",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const transactionSpy = vi.spyOn(runtime.database, "transaction");

    try {
      await expect(
        store.finalize({
          claim,
          decision: {
            kind: "waiting",
            sourceNodeId: claim.nodeId,
            resultCode: "unexpected_terminal",
            trace: {
              schemaVersion: "flow-runtime-trace.v1",
              outcome: "terminal",
              nodeKind: "completed",
              reasonCode: "FLOW_GOAL_REACHED",
              resultCode: "unexpected_terminal"
            }
          } as never
        })
      ).rejects.toThrow("FLOW_RUNTIME_TRACE_INVALID");
      expect(transactionSpy).not.toHaveBeenCalled();
    } finally {
      transactionSpy.mockRestore();
    }
  });

  it("rejects terminal completion from a persisted non-terminal node with zero writes", async () => {
    const fixture = await createAdvancingFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-early-terminal",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    const decision: FlowExecutionDecision = {
      kind: "terminal",
      sourceNodeId: claim.nodeId,
      terminalStatus: "completed",
      resultCode: "invalid_early_completion",
      trace: {
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "terminal",
        nodeKind: "birth_data_available",
        reasonCode: "FLOW_GOAL_REACHED",
        resultCode: "invalid_early_completion"
      }
    };

    await expect(store.finalize({ claim, decision })).rejects.toThrow("FLOW_RUNTIME_TRACE_INVALID");
    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(persisted.token).toMatchObject({ state: "claimed", node_id: "birth-data" });
    expect(persisted.attempts).toEqual([]);
    expect(persisted.events).toEqual([]);
  });

  it("derives terminal completion from the persisted completed-node goal", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-persisted-terminal",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const forgedClaim: FlowExecutionClaim = {
      ...claim,
      graph: flowGraphV2Schema.parse({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.kind === "completed" ? { ...node, config: { goalKey: "forged_completion" } } : node
        )
      })
    };
    const forgedDecision: FlowExecutionDecision = {
      kind: "terminal",
      sourceNodeId: claim.nodeId,
      terminalStatus: "completed",
      resultCode: "forged_completion",
      trace: {
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "terminal",
        nodeKind: "completed",
        reasonCode: "FLOW_GOAL_REACHED",
        resultCode: "forged_completion"
      }
    };

    await expect(store.finalize({ claim: forgedClaim, decision: forgedDecision })).rejects.toThrow(
      "FLOW_RUNTIME_TRACE_INVALID"
    );
    const persisted = await selectExecution(fixture.runId);
    expect(persisted.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(persisted.token).toMatchObject({ state: "claimed", node_id: "completed" });
    expect(persisted.attempts).toEqual([]);
    expect(persisted.events).toEqual([]);
  });

  it("rolls back token, run and attempt writes when the final event insert fails", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-event-rollback",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });

    await installFlowEventInsertFailure();
    try {
      const failure = await store.finalize({ claim, decision }).catch((error: unknown) => error);
      expect(errorChain(failure)).toContain("forced flow run event insert failure");
    } finally {
      await removeFlowEventInsertFailure();
    }

    const afterFailure = await selectExecution(fixture.runId);
    expect(afterFailure.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterFailure.token).toMatchObject({
      state: "claimed",
      lease_owner: "flows-worker-event-rollback",
      attempt_counter: "1",
      fencing_token: "1"
    });
    expect(afterFailure.attempts).toEqual([]);
    expect(afterFailure.events).toEqual([]);
    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({ status: "applied" });
  });

  it("rolls back an advance when its causal event cannot be persisted", async () => {
    const fixture = await createAdvancingFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-advance-rollback",
      leaseDurationMs: 30_000,
      executorKeys: ["birth_data_available:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBirthDataRegistry()
    });

    await installFlowEventInsertFailure();
    try {
      const failure = await store.finalize({ claim, decision }).catch((error: unknown) => error);
      expect(errorChain(failure)).toContain("forced flow run event insert failure");
    } finally {
      await removeFlowEventInsertFailure();
    }

    const afterFailure = await selectExecution(fixture.runId);
    expect(afterFailure.run).toMatchObject({
      status: "running",
      current_node_id: "birth-data",
      trace_sequence: "0"
    });
    expect(afterFailure.token).toMatchObject({
      id: fixture.tokenId,
      node_id: "birth-data",
      state: "claimed",
      node_activation_sequence: "1",
      attempt_counter: "1",
      fencing_token: "1",
      lease_owner: "flows-worker-advance-rollback"
    });
    expect(afterFailure.attempts).toEqual([]);
    expect(afterFailure.events).toEqual([]);
    await expect(store.finalize({ claim, decision })).resolves.toMatchObject({ status: "applied" });
  });

  it("rolls back expired-lease recovery when its trace event cannot be persisted", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await claimExecution(store, {
      leaseOwner: "flows-worker-recovery-rollback",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await expireClaimedToken(fixture.tokenId);

    await installFlowEventInsertFailure();
    try {
      const failure = await store.recoverExpired({ limit: 10 }).catch((error: unknown) => error);
      expect(errorChain(failure)).toContain("forced flow run event insert failure");
    } finally {
      await removeFlowEventInsertFailure();
    }

    const afterFailure = await selectExecution(fixture.runId);
    expect(afterFailure.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(afterFailure.token).toMatchObject({
      state: "claimed",
      lease_owner: "flows-worker-recovery-rollback",
      attempt_counter: "1",
      fencing_token: "1"
    });
    expect(afterFailure.attempts).toEqual([]);
    expect(afterFailure.events).toEqual([]);
    await expect(store.recoverExpired({ limit: 10 })).resolves.toMatchObject({
      recoveredCount: 1
    });
  });

  it("commits each recovered token independently so a later poison write cannot roll back it", async () => {
    const earlier = await createTerminalFixture({ availableAt: "2026-08-03T08:00:00.000Z" });
    const later = await createTerminalFixture({ availableAt: "2026-08-03T08:01:00.000Z" });
    const store = createDrizzleFlowExecutionStore(runtime.database);
    await claimExecution(store, {
      leaseOwner: "flows-worker-recovery-first",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await claimExecution(store, {
      leaseOwner: "flows-worker-recovery-second",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    await runtime.pool.query(
      `update flow_execution_tokens
          set claimed_at = transaction_timestamp() - interval '3 seconds',
              lease_expires_at = case id
            when $1::uuid then transaction_timestamp() - interval '2 seconds'
            when $2::uuid then transaction_timestamp() - interval '1 second'
            else lease_expires_at
          end
        where id = any($3::uuid[])`,
      [earlier.tokenId, later.tokenId, [earlier.tokenId, later.tokenId]]
    );

    await installFlowEventInsertFailure(later.runId);
    try {
      const failure = await store.recoverExpired({ limit: 2 }).catch((error: unknown) => error);
      expect(errorChain(failure)).toContain("forced flow run event insert failure");
    } finally {
      await removeFlowEventInsertFailure();
    }

    const firstState = await selectExecution(earlier.runId);
    expect(firstState.run).toMatchObject({ status: "failed_retryable", trace_sequence: "1" });
    expect(firstState.token).toMatchObject({ state: "retry_scheduled", fencing_token: "2" });
    expect(firstState.attempts).toHaveLength(1);
    expect(firstState.events).toHaveLength(1);

    const secondState = await selectExecution(later.runId);
    expect(secondState.run).toMatchObject({ status: "running", trace_sequence: "0" });
    expect(secondState.token).toMatchObject({
      state: "claimed",
      lease_owner: "flows-worker-recovery-second",
      fencing_token: "1"
    });
    expect(secondState.attempts).toEqual([]);
    expect(secondState.events).toEqual([]);
  });

  it("enforces strict trace JSON and append-only history while allowing aggregate erasure", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-history",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await store.finalize({ claim, decision });
    const persisted = await selectExecution(fixture.runId);
    const attemptId = persisted.attempts[0]?.id ?? raise("Expected attempt id");
    const eventId = persisted.events[0]?.id ?? raise("Expected event id");

    await expect(
      runtime.pool.query(
        "update flow_execution_attempts set result_code = 'tampered' where id = $1",
        [attemptId]
      )
    ).rejects.toThrow("flow execution attempts are immutable");
    await expect(
      runtime.pool.query("delete from flow_run_events where id = $1", [eventId])
    ).rejects.toThrow("flow run events can only be deleted with their run");
    await expect(runtime.pool.query("truncate flow_run_events")).rejects.toThrow(
      "flow run events are immutable"
    );
    await expect(runtime.pool.query("truncate flow_execution_attempts cascade")).rejects.toThrow(
      "flow execution attempts are immutable"
    );
    await expect(
      runtime.pool.query(
        `insert into flow_execution_attempts
          (owner_user_id, flow_run_id, token_id, flow_version_id, node_id, executor_key,
           node_activation_sequence, attempt_number, fencing_token, lease_owner, outcome,
           result_code, trace_summary,
           started_at, completed_at, created_at)
         values ($1, $2, $3, $4, 'completed', 'completed:1:1', 1, 2, 2, 'attacker',
           'completed', 'consultation_prepared', $5, transaction_timestamp(),
           transaction_timestamp(), transaction_timestamp())`,
        [
          fixture.ownerUserId,
          fixture.runId,
          fixture.tokenId,
          fixture.flowVersionId,
          { ...decision.trace, rawMessage: "private message" }
        ]
      )
    ).rejects.toThrow("flow_execution_attempts_trace_summary_schema_check");
    await expect(
      runtime.pool.query(
        `insert into flow_execution_attempts
          (owner_user_id, flow_run_id, token_id, flow_version_id, node_id, executor_key,
           node_activation_sequence, attempt_number, fencing_token, lease_owner, outcome,
           result_code, trace_summary,
           started_at, completed_at, created_at)
         values ($1, $2, $3, $4, 'completed', 'completed:1:1', 1, 2, 2, 'attacker',
           'completed', null, $5, transaction_timestamp(),
           transaction_timestamp(), transaction_timestamp())`,
        [fixture.ownerUserId, fixture.runId, fixture.tokenId, fixture.flowVersionId, decision.trace]
      )
    ).rejects.toThrow('null value in column "result_code"');

    await runtime.pool.query("delete from users where id = $1", [fixture.ownerUserId]);
    const erased = await runtime.pool.query<{ count: string }>(
      "select count(*)::text as count from flow_runs where id = $1",
      [fixture.runId]
    );
    expect(erased.rows[0]?.count).toBe("0");
  });

  it("returns an owner-scoped ordered execution detail pinned to one immutable version", async () => {
    const fixture = await createTerminalFixture();
    const otherOwnerUserId = await createUser();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-detail",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await store.finalize({ claim, decision });

    await expect(
      store.getRunDetail({ ownerUserId: otherOwnerUserId, runId: fixture.runId })
    ).resolves.toBeNull();
    await expect(
      store.getRunDetail({ ownerUserId: fixture.ownerUserId, runId: fixture.runId })
    ).resolves.toMatchObject({
      runId: fixture.runId,
      ownerUserId: fixture.ownerUserId,
      flowId: fixture.flowId,
      flowVersionId: fixture.flowVersionId,
      graphSchemaVersion: "flow-graph.v2",
      status: "completed",
      token: { id: fixture.tokenId, state: "completed", fencingToken: 1n },
      attempts: [{ fencingToken: 1n, outcome: "completed" }],
      events: [{ sequence: 1n, eventType: "run_completed" }]
    });
  });

  it("fails closed when an attempt and its causal event disagree", async () => {
    const fixture = await createTerminalFixture();
    const store = createDrizzleFlowExecutionStore(runtime.database);
    const claim = await claimExecution(store, {
      leaseOwner: "flows-worker-causal-consistency",
      leaseDurationMs: 30_000,
      executorKeys: ["completed:1:1"]
    });
    const decision = await interpretFlowExecutionClaim({
      claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await store.finalize({ claim, decision });
    await runtime.pool.query(
      "ALTER TABLE flow_run_events DISABLE TRIGGER flow_run_events_immutable"
    );
    try {
      await runtime.pool.query(
        `UPDATE flow_run_events
            SET summary = jsonb_set(summary, '{resultCode}', '"different_result"'::jsonb)
          WHERE flow_run_id = $1`,
        [fixture.runId]
      );
    } finally {
      await runtime.pool.query(
        "ALTER TABLE flow_run_events ENABLE TRIGGER flow_run_events_immutable"
      );
    }

    await expect(
      store.getRunDetail({ ownerUserId: fixture.ownerUserId, runId: fixture.runId })
    ).rejects.toThrow("causal event does not match its execution attempt");
  });

  it("orders attempts by causal event sequence when timestamps and ids disagree", async () => {
    const fixture = await createAdvancingFixture();
    const firstAttemptId = "a0000000-0000-4000-8000-000000000002";
    const secondAttemptId = "a0000000-0000-4000-8000-000000000001";
    const occurredAt = "2026-08-03T20:00:00.000Z";
    const advancedTrace = {
      schemaVersion: "flow-runtime-trace.v1",
      outcome: "advanced",
      nodeKind: "birth_data_available",
      reasonCode: "FLOW_EDGE_SELECTED",
      resultCode: "FLOW_TOKEN_ADVANCED",
      sourceHandle: "true",
      selectedEdgeId: "birth-yes",
      targetNodeId: "completed",
      targetNodeKind: "completed"
    };
    const terminalTrace = {
      schemaVersion: "flow-runtime-trace.v1",
      outcome: "terminal",
      nodeKind: "completed",
      reasonCode: "FLOW_GOAL_REACHED",
      resultCode: "consultation_prepared"
    };
    const client = await runtime.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update flow_execution_tokens
            set node_id = 'completed', node_kind = 'completed',
                config_schema_version = 1, executor_contract_version = 1,
                executor_key = 'completed:1:1', state = 'completed',
                node_activation_sequence = 2, attempt_counter = 1, fencing_token = 2,
                terminal_at = $2, updated_at = $2
          where id = $1`,
        [fixture.tokenId, occurredAt]
      );
      await client.query(
        `update flow_runs
            set status = 'completed', current_node_id = 'completed', trace_sequence = 2,
                completed_at = $2, updated_at = $2
          where id = $1`,
        [fixture.runId, occurredAt]
      );
      await client.query(
        `insert into flow_execution_attempts
          (id, owner_user_id, flow_run_id, token_id, flow_version_id, node_id, executor_key,
           node_activation_sequence, attempt_number, fencing_token, lease_owner, outcome,
           result_code, trace_summary, started_at, completed_at, created_at)
         values
          ($1, $3, $4, $5, $6, 'birth-data', 'birth_data_available:1:1',
           1, 1, 1, 'flows-worker-causal-1', 'advanced', 'FLOW_TOKEN_ADVANCED', $7, $9, $9, $9),
          ($2, $3, $4, $5, $6, 'completed', 'completed:1:1',
           2, 1, 2, 'flows-worker-causal-2', 'completed', 'consultation_prepared', $8, $9, $9, $9)`,
        [
          firstAttemptId,
          secondAttemptId,
          fixture.ownerUserId,
          fixture.runId,
          fixture.tokenId,
          fixture.flowVersionId,
          advancedTrace,
          terminalTrace,
          occurredAt
        ]
      );
      await client.query(
        `insert into flow_run_events
          (owner_user_id, flow_run_id, sequence, event_type, node_id, attempt_id, summary, occurred_at)
         values
          ($1, $2, 1, 'token_advanced', 'birth-data', $3, $5, $7),
          ($1, $2, 2, 'run_completed', 'completed', $4, $6, $7)`,
        [
          fixture.ownerUserId,
          fixture.runId,
          firstAttemptId,
          secondAttemptId,
          advancedTrace,
          terminalTrace,
          occurredAt
        ]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const detail = await createDrizzleFlowExecutionStore(runtime.database).getRunDetail({
      ownerUserId: fixture.ownerUserId,
      runId: fixture.runId
    });
    expect(detail?.attempts.map((attempt) => attempt.id)).toEqual([
      firstAttemptId,
      secondAttemptId
    ]);
    expect(detail?.events.map((event) => event.attemptId)).toEqual([
      firstAttemptId,
      secondAttemptId
    ]);
  });

  async function createTerminalFixture(
    input: {
      readonly availableAt?: string;
      readonly capabilityManifest?: unknown;
      readonly graph?: unknown;
      readonly initialNode?: {
        readonly id: string;
        readonly kind: FlowExecutionClaim["nodeKind"];
        readonly configSchemaVersion: number;
        readonly executorContractVersion: number;
      };
    } = {}
  ) {
    const ownerUserId = await createUser();
    const client = await runtime.pool.connect();
    const fixtureGraph = input.graph ?? graph;
    const initialNode = input.initialNode ?? {
      id: "completed",
      kind: "completed" as const,
      configSchemaVersion: 1,
      executorContractVersion: 1
    };

    try {
      await client.query("begin");
      const flow = await client.query<{ id: string }>(
        `insert into flows
          (owner_user_id, name, origin, status, definition_state, approval_mode,
           revision, draft_graph, draft_presentation, created_at, updated_at)
         values ($1, 'Terminal runtime fixture', $2, 'draft', 'draft', 'manual_approve',
           1, $3, $4, transaction_timestamp(), transaction_timestamp())
         returning id`,
        [
          ownerUserId,
          { schemaVersion: "flow-definition-origin.v1", type: "blank" },
          fixtureGraph,
          {
            schemaVersion: "flow-presentation.v1",
            nodes: [
              { nodeId: "manual", position: { x: 80, y: 120 } },
              { nodeId: "completed", position: { x: 400, y: 120 } }
            ],
            viewport: { x: 0, y: 0, zoom: 1 }
          }
        ]
      );
      const flowId = flow.rows[0]?.id ?? raise("Expected flow id");
      const version = await client.query<{ id: string }>(
        `insert into flow_versions
          (flow_id, owner_user_id, version, source_revision, approval_mode,
           graph_schema_version, graph, presentation, capability_manifest, published_at)
         values ($1, $2, 1, 1, 'manual_approve', 'flow-graph.v2', $3, $4, $5,
           transaction_timestamp())
         returning id`,
        [
          flowId,
          ownerUserId,
          fixtureGraph,
          {
            schemaVersion: "flow-presentation.v1",
            nodes: [
              { nodeId: "manual", position: { x: 80, y: 120 } },
              { nodeId: "completed", position: { x: 400, y: 120 } }
            ],
            viewport: { x: 0, y: 0, zoom: 1 }
          },
          input.capabilityManifest ?? capabilityManifest
        ]
      );
      const flowVersionId = version.rows[0]?.id ?? raise("Expected version id");
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
        [ownerUserId, `fixture:${randomUUID()}`, randomUUID()]
      );
      const runtimeEventId = runtimeEvent.rows[0]?.id ?? raise("Expected runtime event id");
      const run = await client.query<{ id: string }>(
        `insert into flow_runs
         (owner_user_id, flow_id, flow_version_id, runtime_event_id, status,
           snapshot, current_node_id, created_at, updated_at)
         values ($1, $2, $3, $4, 'pending', $5, $6,
           transaction_timestamp(), transaction_timestamp())
         returning id`,
        [
          ownerUserId,
          flowId,
          flowVersionId,
          runtimeEventId,
          {
            schemaVersion: "flow-run-snapshot.v2",
            executionSemanticsVersion: "flow-interpreter.v1"
          },
          initialNode.id
        ]
      );
      const runId = run.rows[0]?.id ?? raise("Expected run id");
      const token = await client.query<{ id: string }>(
        `insert into flow_execution_tokens
         (owner_user_id, flow_run_id, flow_version_id, node_id, node_kind,
           config_schema_version, executor_contract_version, executor_key, state,
           available_at, retry_policy_key, max_attempts, retry_base_delay_ms,
           retry_max_delay_ms, attempt_counter, fencing_token, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7,
           $8, 'runnable', coalesce($9::timestamptz, transaction_timestamp()),
           'flow-execution-retry.v1', $10, $11, $12, 0, 0,
           transaction_timestamp(), transaction_timestamp())
         returning id`,
        [
          ownerUserId,
          runId,
          flowVersionId,
          initialNode.id,
          initialNode.kind,
          initialNode.configSchemaVersion,
          initialNode.executorContractVersion,
          `${initialNode.kind}:${initialNode.configSchemaVersion}:${initialNode.executorContractVersion}`,
          input.availableAt ?? null,
          3,
          1_000,
          60_000
        ]
      );
      const tokenId = token.rows[0]?.id ?? raise("Expected token id");
      await client.query("commit");
      return { ownerUserId, flowId, flowVersionId, runId, tokenId };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async function createAdvancingFixture() {
    return createTerminalFixture({
      graph: advancingGraph,
      initialNode: {
        id: "birth-data",
        kind: "birth_data_available",
        configSchemaVersion: 1,
        executorContractVersion: 1
      },
      capabilityManifest: advancingCapabilityManifest
    });
  }

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user id");
  }

  async function selectExecution(runId: string) {
    const [run, token, attempts, events] = await Promise.all([
      runtime.pool.query("select * from flow_runs where id = $1", [runId]),
      runtime.pool.query("select * from flow_execution_tokens where flow_run_id = $1", [runId]),
      runtime.pool.query(
        "select * from flow_execution_attempts where flow_run_id = $1 order by completed_at, id",
        [runId]
      ),
      runtime.pool.query("select * from flow_run_events where flow_run_id = $1 order by sequence", [
        runId
      ])
    ]);
    return {
      run: run.rows[0] ?? null,
      token: token.rows[0] ?? null,
      attempts: attempts.rows,
      events: events.rows
    };
  }

  async function runAfterBlockedLeaseExpiry<T>(
    tokenId: string,
    leaseExpiresAt: string,
    transition: () => Promise<T>
  ): Promise<T> {
    const blocker = await runtime.pool.connect();
    let released = false;
    try {
      await blocker.query("begin");
      await blocker.query("select id from flow_execution_tokens where id = $1 for update", [
        tokenId
      ]);
      const pendingTransition = transition();
      const waitMs = Math.max(0, new Date(leaseExpiresAt).getTime() - Date.now() + 150);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      await blocker.query("rollback");
      released = true;
      return await pendingTransition;
    } finally {
      if (!released) await blocker.query("rollback").catch(() => undefined);
      blocker.release();
    }
  }

  function delayNextDatabaseTransaction() {
    const entered = createDeferred<void>();
    const release = createDeferred<void>();
    const originalTransaction = runtime.database.transaction.bind(runtime.database);
    const spy = vi.spyOn(runtime.database, "transaction");
    spy.mockImplementationOnce(((callback, config) =>
      originalTransaction(async (transaction) => {
        entered.resolve();
        await release.promise;
        return callback(transaction);
      }, config)) as typeof runtime.database.transaction);

    return { entered, release, restore: () => spy.mockRestore() };
  }

  async function expireClaimedToken(tokenId: string): Promise<void> {
    await runtime.pool.query(
      `update flow_execution_tokens
          set claimed_at = transaction_timestamp() - interval '2 seconds',
              lease_expires_at = transaction_timestamp() - interval '1 second'
        where id = $1`,
      [tokenId]
    );
  }

  function createDeferred<T>() {
    let resolve!: (value?: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((resolvePromise) => {
      resolve = resolvePromise as (value?: T | PromiseLike<T>) => void;
    });
    return { promise, resolve };
  }

  async function insertRawCompletedAttempt(
    fixture: Awaited<ReturnType<typeof createTerminalFixture>>,
    claim: FlowExecutionClaim,
    attemptNumber: number,
    fencingToken: number
  ) {
    return runtime.pool.query(
      `insert into flow_execution_attempts
        (owner_user_id, flow_run_id, token_id, flow_version_id, node_id,
         executor_key, node_activation_sequence, attempt_number, fencing_token, lease_owner, outcome,
         result_code, trace_summary, started_at, completed_at, created_at)
       values ($1, $2, $3, $4, 'completed', 'completed:1:1', $5, $6, $7, $8,
         'completed', 'consultation_prepared', $9, $10, clock_timestamp(),
         clock_timestamp())`,
      [
        fixture.ownerUserId,
        fixture.runId,
        fixture.tokenId,
        fixture.flowVersionId,
        claim.nodeActivationSequence,
        attemptNumber,
        fencingToken,
        claim.leaseOwner,
        {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "terminal",
          nodeKind: "completed",
          reasonCode: "FLOW_GOAL_REACHED",
          resultCode: "consultation_prepared"
        },
        claim.claimedAt
      ]
    );
  }

  async function restoreFailureStateConstraint(): Promise<void> {
    await runtime.pool.query(`
      ALTER TABLE flow_execution_tokens
        ADD CONSTRAINT flow_execution_tokens_failure_state_check CHECK (
          (
            state = 'retry_scheduled'
            AND failure_disposition IS NOT NULL
            AND failure_disposition = 'retry_scheduled'
            AND failure_reason_code IS NOT NULL
            AND failure_reason_code IN (
              'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE',
              'FLOW_TOKEN_LEASE_EXPIRED'
            )
            AND quarantined_at IS NULL
          ) OR (
            state = 'failed'
            AND failure_disposition IS NOT NULL
            AND failure_reason_code IS NOT NULL
            AND (
              (
                failure_disposition = 'quarantined'
                AND failure_reason_code IN (
                  'FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID',
                  'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH',
                  'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID',
                  'FLOW_RUNTIME_TRACE_INVALID', 'FLOW_NODE_EXECUTOR_UNAVAILABLE'
                )
                AND quarantined_at IS NOT NULL
              ) OR (
                failure_disposition = 'failed_terminal'
                AND failure_reason_code IN (
                  'FLOW_NODE_EXECUTION_REJECTED', 'FLOW_NODE_EXECUTION_RETRYABLE',
                  'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE', 'FLOW_TOKEN_LEASE_EXPIRED'
                )
                AND quarantined_at IS NULL
              )
            )
          ) OR (
            state NOT IN ('retry_scheduled', 'failed')
            AND failure_disposition IS NULL
            AND failure_reason_code IS NULL
            AND quarantined_at IS NULL
          )
        )
    `);
  }

  async function restoreLeaseStateConstraint(): Promise<void> {
    await runtime.pool.query(`
      ALTER TABLE flow_execution_tokens
        ADD CONSTRAINT flow_execution_tokens_lease_state_check CHECK (
          (
            state = 'claimed'
            AND claimed_at IS NOT NULL
            AND lease_owner IS NOT NULL
            AND lease_expires_at IS NOT NULL
            AND claimed_at <= lease_expires_at
          ) OR (
            state <> 'claimed'
            AND claimed_at IS NULL
            AND lease_owner IS NULL
            AND lease_expires_at IS NULL
          )
        )
    `);
  }

  async function installFlowEventInsertFailure(runId?: string): Promise<void> {
    const failureStatement = runId
      ? `IF NEW.flow_run_id = '${runId}'::uuid THEN
          RAISE EXCEPTION 'forced flow run event insert failure';
        END IF;`
      : "RAISE EXCEPTION 'forced flow run event insert failure';";
    await runtime.pool.query(`
      CREATE OR REPLACE FUNCTION elevenhouse_test_fail_flow_event_insert()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $test_failure$
      BEGIN
        ${failureStatement}
        RETURN NEW;
      END;
      $test_failure$;
      CREATE TRIGGER flow_run_events_test_insert_failure
      BEFORE INSERT ON flow_run_events
      FOR EACH ROW
      EXECUTE FUNCTION elevenhouse_test_fail_flow_event_insert();
    `);
  }

  async function removeFlowEventInsertFailure(): Promise<void> {
    await runtime.pool.query(`
      DROP TRIGGER IF EXISTS flow_run_events_test_insert_failure ON flow_run_events;
      DROP FUNCTION IF EXISTS elevenhouse_test_fail_flow_event_insert();
    `);
  }
});

async function claimExecution(
  store: ReturnType<typeof createDrizzleFlowExecutionStore>,
  input: Omit<
    Parameters<ReturnType<typeof createDrizzleFlowExecutionStore>["claimNext"]>[0],
    "ownerScope"
  > &
    Partial<
      Pick<
        Parameters<ReturnType<typeof createDrizzleFlowExecutionStore>["claimNext"]>[0],
        "ownerScope"
      >
    >
): Promise<FlowExecutionClaim> {
  const result = await store.claimNext({
    ...input,
    ownerScope: input.ownerScope ?? { kind: "all" }
  });
  if (!result || result.status !== "claimed") raise("Expected claimed flow execution token");
  return result.claim;
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
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
