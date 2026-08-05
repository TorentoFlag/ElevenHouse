import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { flowGraphV2Schema } from "@elevenhouse/contracts";
import {
  FlowWorkerReadinessLeaseLostError,
  compileFlowGraphV2,
  createBuiltInFlowNodeExecutorRegistry,
  interpretFlowExecutionClaim,
  replaceFlowRuntimeRolloutPolicy,
  type FlowRuntimeRolloutPolicy
} from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { reconcileAuditActorSubjects } from "../../../scripts/audit-actor-subject-reconciliation";
import { reconcileFlowRuntimeControlAuthority } from "../../../scripts/flow-runtime-control-reconciliation";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzleFlowWorkerExecutionStore } from "./drizzle-flow-execution-store";
import { createDrizzleFlowRuntimeControlCommandStore } from "./drizzle-flow-runtime-control-command-store";
import { createDrizzleFlowRuntimeOwnerSubjectStore } from "./drizzle-flow-runtime-owner-subject-store";
import { createDrizzleFlowWorkerReadinessStore } from "./drizzle-flow-worker-readiness-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const integrationBaselinePath =
  process.env.FLOW_INTEGRATION_BASELINE_PATH ?? "packages/db/drizzle/0000_sticky_rictor.sql";
const databaseName = `elevenhouse_flow_worker_claim_${randomUUID().replaceAll("-", "")}`;
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
      displayTitle: "Client selected manually",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {}
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Preparation completed",
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
const compiled = compileFlowGraphV2(graph);
if (!compiled.capabilityManifest) throw new Error("Expected publishable Flow fixture");
const capabilityManifest = compiled.capabilityManifest;
const presentation = {
  schemaVersion: "flow-presentation.v1",
  nodes: [
    { nodeId: "manual", position: { x: 80, y: 120 } },
    { nodeId: "completed", position: { x: 400, y: 120 } }
  ],
  viewport: { x: 0, y: 0, zoom: 1 }
} as const;
const allPolicyRequirementKeys = [
  "executor:completed:1:1",
  "runtime:flow-interpreter.v1",
  "trigger:manual_client:1:1:1"
] as const;
const workerRequirementKeys = [
  "executor:completed:1:1",
  "runtime:flow-interpreter.v1"
] as const;

describe("DB-authoritative Flow worker execution store", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    const pool = new Pool({ connectionString: isolatedDatabaseUrl });
    runtime = {
      pool,
      database: drizzle(pool) as unknown as ElevenHouseDatabase,
      close: () => pool.end()
    };
    await runtime.pool.query(readFileSync(integrationBaselinePath, "utf8"));
    const client = await runtime.pool.connect();
    try {
      await client.query("BEGIN");
      await reconcileAuditActorSubjects(client as unknown as Client);
      await reconcileFlowRuntimeControlAuthority(client as unknown as Client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
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

  it("changes owner and requirement claim authority without restart and fails closed on drain", async () => {
    const actorUserId = await createUser();
    const firstOwnerUserId = await createUser();
    const secondOwnerUserId = await createUser();
    const firstFixture = await createTerminalFixture(firstOwnerUserId, "2026-08-04T08:00:00.000Z");
    const secondFixture = await createTerminalFixture(secondOwnerUserId, "2026-08-04T08:01:00.000Z");
    const subjectStore = createDrizzleFlowRuntimeOwnerSubjectStore(runtime.database);
    const subjects = await subjectStore.resolveOrCreateActive({
      ownerUserIds: [firstOwnerUserId, secondOwnerUserId]
    });
    const firstOwnerSubjectId = subjects.find(
      (mapping) => mapping.ownerUserId === firstOwnerUserId
    )?.ownerSubjectId;
    const secondOwnerSubjectId = subjects.find(
      (mapping) => mapping.ownerUserId === secondOwnerUserId
    )?.ownerSubjectId;
    if (!firstOwnerSubjectId || !secondOwnerSubjectId) {
      throw new Error("Expected owner subject mappings");
    }

    const commandStore = createDrizzleFlowRuntimeControlCommandStore(runtime.database);
    await replacePolicy({
      commandStore,
      actorUserId,
      expectedRevision: 1,
      key: "worker-policy-0001",
      ownerSubjectIds: [firstOwnerSubjectId]
    });
    const sessionId = randomUUID();
    const instanceId = "flows-worker-integration-a";
    const readinessStore = createDrizzleFlowWorkerReadinessStore(runtime.database);
    await readinessStore.register({
      schemaVersion: "flow-worker-registration.v2",
      sessionId,
      instanceId,
      roles: ["executor"],
      maxRuntimeMode: "canary",
      maxCanaryOwnerSubjectIds: [firstOwnerSubjectId, secondOwnerSubjectId].sort(),
      requirementKeys: workerRequirementKeys,
      deploymentId: "integration-deployment",
      buildId: "integration-build"
    });
    const store = createDrizzleFlowWorkerExecutionStore(runtime.database, {
      instanceId,
      sessionId
    });

    const firstClaim = await claim(store);
    expect(firstClaim).toMatchObject({
      status: "claimed",
      claim: { ownerUserId: firstOwnerUserId, tokenId: firstFixture.tokenId }
    });
    if (!firstClaim || firstClaim.status !== "claimed") {
      throw new Error("Expected first controlled claim");
    }
    await replacePolicy({
      commandStore,
      actorUserId,
      expectedRevision: 2,
      key: "worker-policy-0002",
      ownerSubjectIds: [secondOwnerSubjectId]
    });
    const firstDecision = await interpretFlowExecutionClaim({
      claim: firstClaim.claim,
      registry: createBuiltInFlowNodeExecutorRegistry()
    });
    await expect(
      store.finalize({ claim: firstClaim.claim, decision: firstDecision })
    ).resolves.toMatchObject({ status: "applied" });
    const authorityEvidence = await runtime.pool.query<{
      token_policy_revision: string;
      token_worker_session_id: string;
      token_policy_digest: string;
      token_registration_digest: string;
      attempt_policy_revision: string;
      attempt_worker_session_id: string;
      attempt_policy_digest: string;
      attempt_registration_digest: string;
      expected_policy_digest: string;
      expected_registration_digest: string;
    }>(`
      SELECT token.claim_control_policy_revision::text AS token_policy_revision,
             token.claim_worker_session_id::text AS token_worker_session_id,
             token.claim_policy_digest AS token_policy_digest,
             token.claim_worker_registration_digest AS token_registration_digest,
             attempt.control_policy_revision::text AS attempt_policy_revision,
             attempt.worker_session_id::text AS attempt_worker_session_id,
             attempt.policy_digest AS attempt_policy_digest,
             attempt.worker_registration_digest AS attempt_registration_digest,
             policy.policy_digest AS expected_policy_digest,
             registration.registration_digest AS expected_registration_digest
        FROM flow_execution_tokens token
        JOIN flow_execution_attempts attempt ON attempt.token_id = token.id
        JOIN flow_runtime_rollout_policy_versions policy ON policy.revision = 2
        JOIN flow_worker_registrations registration ON registration.session_id = $2
       WHERE token.id = $1
    `, [firstFixture.tokenId, sessionId]);
    expect(authorityEvidence.rows[0]).toEqual({
      token_policy_revision: "2",
      token_worker_session_id: sessionId,
      token_policy_digest: authorityEvidence.rows[0]?.expected_policy_digest,
      token_registration_digest: authorityEvidence.rows[0]?.expected_registration_digest,
      attempt_policy_revision: "2",
      attempt_worker_session_id: sessionId,
      attempt_policy_digest: authorityEvidence.rows[0]?.expected_policy_digest,
      attempt_registration_digest: authorityEvidence.rows[0]?.expected_registration_digest,
      expected_policy_digest: authorityEvidence.rows[0]?.expected_policy_digest,
      expected_registration_digest: authorityEvidence.rows[0]?.expected_registration_digest
    });
    await expect(claim(store)).resolves.toBeNull();
    await readinessStore.heartbeat({ instanceId, sessionId });
    await expect(claim(store)).resolves.toMatchObject({
      status: "claimed",
      claim: { ownerUserId: secondOwnerUserId, tokenId: secondFixture.tokenId }
    });

    await createTerminalFixture(secondOwnerUserId, "2026-08-04T08:02:00.000Z");
    await replacePolicy({
      commandStore,
      actorUserId,
      expectedRevision: 3,
      key: "worker-policy-0003",
      ownerSubjectIds: [secondOwnerSubjectId],
      allowedRequirementKeys: [
        "runtime:flow-interpreter.v1",
        "trigger:manual_client:1:1:1"
      ]
    });
    await readinessStore.heartbeat({ instanceId, sessionId });
    await expect(claim(store)).resolves.toBeNull();

    await replacePolicy({
      commandStore,
      actorUserId,
      expectedRevision: 4,
      key: "worker-policy-0004",
      ownerSubjectIds: [secondOwnerSubjectId],
      claimKilledRequirementKeys: ["executor:completed:1:1"]
    });
    await readinessStore.heartbeat({ instanceId, sessionId });
    await expect(claim(store)).resolves.toBeNull();

    await readinessStore.beginDrain({ instanceId, sessionId });
    await expect(claim(store)).rejects.toBeInstanceOf(FlowWorkerReadinessLeaseLostError);

    const untouched = await runtime.pool.query<{ state: string }>(
      "SELECT state FROM flow_execution_tokens WHERE owner_user_id = $1 AND state = 'runnable'",
      [secondOwnerUserId]
    );
    expect(untouched.rows).toEqual([{ state: "runnable" }]);
  });
});

async function replacePolicy(input: {
  readonly commandStore: ReturnType<typeof createDrizzleFlowRuntimeControlCommandStore>;
  readonly actorUserId: string;
  readonly expectedRevision: number;
  readonly key: string;
  readonly ownerSubjectIds: readonly string[];
  readonly allowedRequirementKeys?: readonly string[];
  readonly claimKilledRequirementKeys?: readonly string[];
}) {
  return replaceFlowRuntimeRolloutPolicy({
    store: input.commandStore,
    actorUserId: input.actorUserId,
    idempotencyKey: input.key,
    expectedRevision: input.expectedRevision,
    reason: "Worker claim authority integration",
    policy: policy({
      ownerSubjectIds: input.ownerSubjectIds,
      allowedRequirementKeys: input.allowedRequirementKeys,
      claimKilledRequirementKeys: input.claimKilledRequirementKeys
    })
  });
}

function policy(input: {
  readonly ownerSubjectIds: readonly string[];
  readonly allowedRequirementKeys?: readonly string[];
  readonly claimKilledRequirementKeys?: readonly string[];
}): Omit<FlowRuntimeRolloutPolicy, "revision"> {
  return {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    mode: "canary",
    canaryOwnerSubjectIds: [...input.ownerSubjectIds].sort(),
    allowedRequirementKeys: [...(input.allowedRequirementKeys ?? allPolicyRequirementKeys)].sort(),
    killSwitches: {
      enrollment: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      claim: {
        global: false,
        ownerSubjectIds: [],
        capabilityKeys: [...(input.claimKilledRequirementKeys ?? [])].sort()
      },
      externalDispatch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
    },
    readinessLeaseTtlMs: 30_000,
    tokenLeaseDurationMs: 45_000
  };
}

async function claim(store: ReturnType<typeof createDrizzleFlowWorkerExecutionStore>) {
  return store.claimNext({
    executorKeys: ["completed:1:1"]
  });
}

async function createUser(): Promise<string> {
  const result = await runtime.pool.query<{ id: string }>(
    "INSERT INTO users (status) VALUES ('active') RETURNING id"
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Expected user id");
  return id;
}

async function createTerminalFixture(ownerUserId: string, availableAt: string) {
  const client = await runtime.pool.connect();
  try {
    await client.query("BEGIN");
    const flow = await client.query<{ id: string }>(
      `insert into flows
        (owner_user_id, name, origin, status, definition_state, approval_mode,
         revision, draft_graph, draft_presentation, created_at, updated_at)
       values ($1, 'Worker control fixture', $2, 'draft', 'draft', 'manual_approve',
         1, $3, $4, transaction_timestamp(), transaction_timestamp())
       returning id`,
      [
        ownerUserId,
        { schemaVersion: "flow-definition-origin.v1", type: "blank" },
        graph,
        presentation
      ]
    );
    const flowId = flow.rows[0]?.id;
    if (!flowId) throw new Error("Expected flow id");
    const version = await client.query<{ id: string }>(
      `insert into flow_versions
        (flow_id, owner_user_id, version, source_revision, approval_mode,
         graph_schema_version, graph, presentation, capability_manifest, published_at)
       values ($1, $2, 1, 1, 'manual_approve', 'flow-graph.v2', $3, $4, $5,
         transaction_timestamp())
       returning id`,
      [flowId, ownerUserId, graph, presentation, capabilityManifest]
    );
    const flowVersionId = version.rows[0]?.id;
    if (!flowVersionId) throw new Error("Expected flow version id");
    await client.query(
      `update flows
          set status = 'published', definition_state = 'versioned',
              published_version_id = $2,
              published_at = (select published_at from flow_versions where id = $2),
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
    const runtimeEventId = runtimeEvent.rows[0]?.id;
    if (!runtimeEventId) throw new Error("Expected runtime event id");
    const run = await client.query<{ id: string }>(
      `insert into flow_runs
        (owner_user_id, flow_id, flow_version_id, runtime_event_id, status,
         snapshot, current_node_id, created_at, updated_at)
       values ($1, $2, $3, $4, 'pending', $5, 'completed',
         transaction_timestamp(), transaction_timestamp())
       returning id`,
      [
        ownerUserId,
        flowId,
        flowVersionId,
        runtimeEventId,
        { schemaVersion: "flow-run-snapshot.v2", executionSemanticsVersion: "flow-interpreter.v1" }
      ]
    );
    const runId = run.rows[0]?.id;
    if (!runId) throw new Error("Expected run id");
    const token = await client.query<{ id: string }>(
      `insert into flow_execution_tokens
        (owner_user_id, flow_run_id, flow_version_id, node_id, node_kind,
         config_schema_version, executor_contract_version, executor_key, state,
         available_at, retry_policy_key, max_attempts, retry_base_delay_ms,
         retry_max_delay_ms, attempt_counter, fencing_token, created_at, updated_at)
       values ($1, $2, $3, 'completed', 'completed', 1, 1,
         'completed:1:1', 'runnable', $4, 'flow-execution-retry.v1', 3, 1000,
         60000, 0, 0, transaction_timestamp(), transaction_timestamp())
       returning id`,
      [ownerUserId, runId, flowVersionId, availableAt]
    );
    const tokenId = token.rows[0]?.id;
    if (!tokenId) throw new Error("Expected token id");
    await client.query("COMMIT");
    return { flowId, flowVersionId, runId, tokenId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  assertDevelopmentDatabaseUrl(value);
  return value;
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}
