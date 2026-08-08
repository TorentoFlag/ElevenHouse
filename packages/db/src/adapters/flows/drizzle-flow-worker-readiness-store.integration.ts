import { randomUUID } from "node:crypto";

import {
  FlowRuntimeControlIntegrityError,
  FlowWorkerReadinessLeaseLostError,
  FlowWorkerReadinessSessionBusyError,
  FlowWorkerRuntimeModeCeilingError,
  replaceFlowRuntimeRolloutPolicy,
  type FlowRuntimeRolloutPolicy,
  type FlowWorkerRegistration
} from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { reconcileAuditActorSubjects } from "../../../scripts/audit-actor-subject-reconciliation";
import { reconcileFlowRuntimeControlAuthority } from "../../../scripts/flow-runtime-control-reconciliation";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzleFlowRuntimeControlReader } from "./drizzle-flow-runtime-control-reader";
import { createDrizzleFlowRuntimeAvailabilityReader } from "./drizzle-flow-runtime-availability-reader";
import { createDrizzleFlowRuntimeControlCommandStore } from "./drizzle-flow-runtime-control-command-store";
import { runFlowWorkerRegistrationRetention } from "./drizzle-flow-worker-registration-retention-store";
import { createDrizzleFlowWorkerReadinessStore } from "./drizzle-flow-worker-readiness-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_flow_worker_readiness_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
const ownerUserId = "00000000-0000-4000-8000-000000000001";
const actorUserId = "00000000-0000-4000-8000-000000000099";
let ownerSubjectId: string;
let runtime: {
  readonly pool: Pool;
  readonly database: ElevenHouseDatabase;
  readonly close: () => Promise<void>;
};

describe("Flow worker readiness store Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    const pool = new Pool({ connectionString: isolatedDatabaseUrl });
    runtime = {
      pool,
      database: drizzle(pool) as unknown as ElevenHouseDatabase,
      close: () => pool.end()
    };
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
    await runtime.pool.query("DROP SCHEMA public CASCADE");
    await runtime.pool.query("CREATE SCHEMA public");
    await runtime.pool.query("CREATE TABLE users (id uuid PRIMARY KEY)");
    const client = new Client({ connectionString: isolatedDatabaseUrl });
    await client.connect();
    try {
      await client.query("BEGIN");
      await reconcileAuditActorSubjects(client);
      await reconcileFlowRuntimeControlAuthority(client);
      await client.query("COMMIT");
    } finally {
      await client.end();
    }
    await runtime.pool.query("INSERT INTO users (id) VALUES ($1), ($2)", [
      ownerUserId,
      actorUserId
    ]);
    const owner = await runtime.pool.query<{ owner_subject_id: string }>(
      "INSERT INTO flow_runtime_owner_subjects (owner_user_id) VALUES ($1) RETURNING owner_subject_id",
      [ownerUserId]
    );
    ownerSubjectId = owner.rows[0]!.owner_subject_id;
  });

  it("registers once and exact-replays an unknown registration outcome", async () => {
    const store = createDrizzleFlowWorkerReadinessStore(runtime.database);
    const sessionId = randomUUID();
    const first = await store.register(registration(sessionId));
    const replay = await store.register(registration(sessionId));

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      schemaVersion: "flow-worker-readiness-authority.v1",
      instanceId: "flows-worker-a",
      sessionId,
      state: "ready",
      policyRevision: 1,
      heartbeatSequence: 1,
      drainingAt: null
    });
    expect(Date.parse(first.readyUntil)).toBeGreaterThan(Date.parse(first.heartbeatAt));
    await expect(
      store.register(registration(sessionId, { buildId: "different-build" }))
    ).rejects.toBeInstanceOf(FlowRuntimeControlIntegrityError);
  });

  it("reads and verifies the complete current policy evidence", async () => {
    const reader = createDrizzleFlowRuntimeControlReader(runtime.database);
    await expect(reader.readCurrent()).resolves.toMatchObject({
      schemaVersion: "flow-runtime-rollout-policy.v2",
      revision: 1,
      mode: "definition_only",
      canaryOwnerSubjectIds: [],
      allowedRequirementKeys: [],
      readinessLeaseTtlMs: 30_000,
      tokenLeaseDurationMs: 30_000,
      killSwitches: {
        enrollment: { global: true, ownerSubjectIds: [], capabilityKeys: [] },
        claim: { global: true, ownerSubjectIds: [], capabilityKeys: [] },
        externalDispatch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
      }
    });

    await runtime.pool.query(
      "ALTER TABLE flow_runtime_rollout_policy_versions DISABLE TRIGGER flow_runtime_rollout_policy_versions_immutable"
    );
    await runtime.pool.query(
      "UPDATE flow_runtime_rollout_policy_versions SET canonical_preimage = canonical_preimage || ' ' WHERE revision = 1"
    );
    await runtime.pool.query(
      "ALTER TABLE flow_runtime_rollout_policy_versions ENABLE TRIGGER flow_runtime_rollout_policy_versions_immutable"
    );
    await expect(reader.readCurrent()).rejects.toBeInstanceOf(FlowRuntimeControlIntegrityError);
  });

  it("projects owner-level execution availability only for a live canary executor", async () => {
    await activateCanaryPolicy();
    const store = createDrizzleFlowWorkerReadinessStore(runtime.database);
    const sessionId = randomUUID();
    await store.register(registration(sessionId));
    const reader = createDrizzleFlowRuntimeAvailabilityReader(runtime.database);

    await expect(reader.readForOwner({ ownerUserId })).resolves.toEqual({
      mode: "canary",
      executionAvailable: true,
      reasonCode: null,
      historySemantics: "durable_execution"
    });

    await store.beginDrain({ instanceId: "flows-worker-a", sessionId });
    await expect(reader.readForOwner({ ownerUserId })).resolves.toEqual({
      mode: "canary",
      executionAvailable: false,
      reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
      historySemantics: "durable_execution"
    });
  });

  it("heartbeats, drains and permanently fences the superseded session", async () => {
    const store = createDrizzleFlowWorkerReadinessStore(runtime.database);
    const firstSession = randomUUID();
    const secondSession = randomUUID();
    await store.register(registration(firstSession));

    await expect(
      store.heartbeat({ instanceId: "flows-worker-a", sessionId: firstSession })
    ).resolves.toMatchObject({ state: "ready", heartbeatSequence: 2 });
    const drained = await store.beginDrain({
      instanceId: "flows-worker-a",
      sessionId: firstSession
    });
    expect(drained).toMatchObject({ state: "draining", heartbeatSequence: 3 });
    expect(drained.heartbeatAt).toBe(drained.readyUntil);
    expect(drained.drainingAt).toBe(drained.readyUntil);
    await expect(
      store.beginDrain({ instanceId: "flows-worker-a", sessionId: firstSession })
    ).resolves.toEqual(drained);
    await expect(store.register(registration(firstSession))).rejects.toBeInstanceOf(
      FlowWorkerReadinessLeaseLostError
    );

    const tombstone = await runtime.pool.query<{ retirement_reason: string }>(
      "SELECT retirement_reason FROM flow_worker_registration_tombstones WHERE session_id = $1",
      [firstSession]
    );
    expect(tombstone.rows[0]?.retirement_reason).toBe("explicit_drain");

    await expect(store.register(registration(secondSession))).resolves.toMatchObject({
      sessionId: secondSession,
      heartbeatSequence: 1,
      state: "ready"
    });
    await expect(
      store.heartbeat({ instanceId: "flows-worker-a", sessionId: firstSession })
    ).rejects.toBeInstanceOf(FlowWorkerReadinessLeaseLostError);
  });

  it("allows only one of two new sessions to own the same live instance", async () => {
    const store = createDrizzleFlowWorkerReadinessStore(runtime.database);
    const results = await Promise.allSettled([
      store.register(registration(randomUUID())),
      store.register(registration(randomUUID()))
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.any(FlowWorkerReadinessSessionBusyError)
    });
    const count = await runtime.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM flow_worker_registrations"
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("fails startup when the persisted policy exceeds the deployment ceiling", async () => {
    await activateEnabledPolicy();
    const store = createDrizzleFlowWorkerReadinessStore(runtime.database);

    await expect(store.register(registration(randomUUID()))).rejects.toBeInstanceOf(
      FlowWorkerRuntimeModeCeilingError
    );
    const count = await runtime.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM flow_worker_registrations"
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  it("retires a stale crashed session using DB time and permanently fences it", async () => {
    const store = createDrizzleFlowWorkerReadinessStore(runtime.database);
    const sessionId = randomUUID();
    await store.register(registration(sessionId));
    await runtime.pool.query(
      "ALTER TABLE flow_worker_readiness_leases DISABLE TRIGGER flow_worker_readiness_leases_prepare"
    );
    await runtime.pool.query(
      `UPDATE flow_worker_readiness_leases
          SET heartbeat_at = stale.heartbeat_at,
              ready_until = stale.heartbeat_at + interval '30 seconds'
          FROM (
            SELECT clock_timestamp() - interval '25 hours 1 minute' AS heartbeat_at
          ) AS stale
        WHERE session_id = $1`,
      [sessionId]
    );
    await runtime.pool.query(
      "ALTER TABLE flow_worker_readiness_leases ENABLE TRIGGER flow_worker_readiness_leases_prepare"
    );

    await expect(
      runFlowWorkerRegistrationRetention(runtime.database, { batchSize: 10 })
    ).resolves.toEqual({ retired: 1, purged: 0 });
    await expect(
      store.heartbeat({ instanceId: "flows-worker-a", sessionId })
    ).rejects.toBeInstanceOf(FlowWorkerReadinessLeaseLostError);
    const tombstone = await runtime.pool.query<{ retirement_reason: string }>(
      "SELECT retirement_reason FROM flow_worker_registration_tombstones WHERE session_id = $1",
      [sessionId]
    );
    expect(tombstone.rows[0]?.retirement_reason).toBe("stale_expired");
  });

  it("purges full retired registrations in bounded batches but keeps permanent tombstones", async () => {
    const store = createDrizzleFlowWorkerReadinessStore(runtime.database);
    const sessions = [randomUUID(), randomUUID(), randomUUID()];
    for (const [index, sessionId] of sessions.entries()) {
      const instanceId = `flows-worker-retention-${index}`;
      await store.register(registration(sessionId, { instanceId }));
      await store.beginDrain({ instanceId, sessionId });
    }
    await runtime.pool.query(
      "ALTER TABLE flow_worker_registration_tombstones DISABLE TRIGGER flow_worker_registration_tombstones_immutable"
    );
    await runtime.pool.query(
      `UPDATE flow_worker_registration_tombstones
          SET retired_at = stale.retired_at,
              purge_after = stale.retired_at + interval '30 days'
          FROM (
            SELECT clock_timestamp() - interval '31 days' AS retired_at
          ) AS stale`
    );
    await runtime.pool.query(
      "ALTER TABLE flow_worker_registration_tombstones ENABLE TRIGGER flow_worker_registration_tombstones_immutable"
    );

    await expect(
      runFlowWorkerRegistrationRetention(runtime.database, { batchSize: 2 })
    ).resolves.toEqual({ retired: 0, purged: 2 });
    await expect(
      runFlowWorkerRegistrationRetention(runtime.database, { batchSize: 2 })
    ).resolves.toEqual({ retired: 0, purged: 1 });
    const counts = await runtime.pool.query<{
      registrations: string;
      tombstones: string;
      readiness: string;
    }>(`
      SELECT (SELECT count(*)::text FROM flow_worker_registrations) AS registrations,
             (SELECT count(*)::text FROM flow_worker_registration_tombstones) AS tombstones,
             (SELECT count(*)::text FROM flow_worker_readiness_leases) AS readiness
    `);
    expect(counts.rows[0]).toEqual({ registrations: "0", tombstones: "3", readiness: "0" });
  });
});

function registration(
  sessionId: string,
  overrides: Partial<FlowWorkerRegistration> = {}
): FlowWorkerRegistration {
  return {
    schemaVersion: "flow-worker-registration.v2",
    sessionId,
    instanceId: "flows-worker-a",
    roles: ["executor", "enrollment"],
    maxRuntimeMode: "canary",
    maxCanaryOwnerSubjectIds: [ownerSubjectId],
    requirementKeys: ["runtime:flow-interpreter.v1", "executor:completed:1:1"],
    deploymentId: "deployment-a",
    buildId: "build-a",
    ...overrides
  };
}

async function activateEnabledPolicy(): Promise<void> {
  const policy: Omit<FlowRuntimeRolloutPolicy, "revision"> = {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    mode: "enabled",
    canaryOwnerSubjectIds: [],
    allowedRequirementKeys: [
      "executor:completed:1:1",
      "runtime:flow-interpreter.v1"
    ],
    killSwitches: {
      enrollment: { global: true, ownerSubjectIds: [], capabilityKeys: [] },
      claim: { global: true, ownerSubjectIds: [], capabilityKeys: [] },
      externalDispatch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
    },
    readinessLeaseTtlMs: 30_000,
    tokenLeaseDurationMs: 30_000
  };
  await replaceFlowRuntimeRolloutPolicy({
    store: createDrizzleFlowRuntimeControlCommandStore(runtime.database),
    actorUserId,
    idempotencyKey: "runtime-policy-enabled-0001",
    expectedRevision: 1,
    policy,
    reason: "Integration enabled policy"
  });
}

async function activateCanaryPolicy(): Promise<void> {
  const policy: Omit<FlowRuntimeRolloutPolicy, "revision"> = {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    mode: "canary",
    canaryOwnerSubjectIds: [ownerSubjectId],
    allowedRequirementKeys: ["executor:completed:1:1", "runtime:flow-interpreter.v1"],
    killSwitches: {
      enrollment: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      claim: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      externalDispatch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
    },
    readinessLeaseTtlMs: 30_000,
    tokenLeaseDurationMs: 30_000
  };
  await replaceFlowRuntimeRolloutPolicy({
    store: createDrizzleFlowRuntimeControlCommandStore(runtime.database),
    actorUserId,
    idempotencyKey: "runtime-policy-canary-0001",
    expectedRevision: 1,
    policy,
    reason: "Integration canary policy"
  });
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "test Flow worker readiness");
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
