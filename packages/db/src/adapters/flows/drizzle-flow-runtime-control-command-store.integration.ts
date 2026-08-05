import { randomUUID } from "node:crypto";

import {
  FlowRuntimeControlCommandIdempotencyConflictError,
  FlowRuntimeControlCommandReplayExpiredError,
  replaceFlowRuntimeRolloutPolicy,
  type FlowRuntimeRolloutPolicy
} from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { reconcileAuditActorSubjects } from "../../../scripts/audit-actor-subject-reconciliation";
import { reconcileFlowRuntimeControlAuthority } from "../../../scripts/flow-runtime-control-reconciliation";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzleFlowRuntimeControlCommandStore } from "./drizzle-flow-runtime-control-command-store";
import { runFlowRuntimeControlOutcomeRetention } from "./drizzle-flow-runtime-control-retention-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_flow_runtime_control_command_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
const actorUserId = "00000000-0000-4000-8000-000000000099";
const ownerUserId = "00000000-0000-4000-8000-000000000001";
let ownerSubjectId: string;
let runtime: {
  readonly pool: Pool;
  readonly database: ElevenHouseDatabase;
  readonly close: () => Promise<void>;
};

describe("Flow runtime control command store Drizzle/PostgreSQL integration", () => {
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
    await runtime.pool.query("INSERT INTO users (id) VALUES ($1), ($2)", [
      actorUserId,
      ownerUserId
    ]);
    const owner = await runtime.pool.query<{ owner_subject_id: string }>(
      "INSERT INTO flow_runtime_owner_subjects (owner_user_id) VALUES ($1) RETURNING owner_subject_id",
      [ownerUserId]
    );
    ownerSubjectId = owner.rows[0]!.owner_subject_id;
  });

  it("applies one revision and exact-replays an unknown commit outcome", async () => {
    const store = createDrizzleFlowRuntimeControlCommandStore(runtime.database);
    const input = commandInput(store, "runtime-policy-0001");

    const created = await replaceFlowRuntimeRolloutPolicy(input);
    const replayed = await replaceFlowRuntimeRolloutPolicy(input);

    expect(created).toMatchObject({
      kind: "created",
      outcome: { kind: "applied", controlRevision: 2 }
    });
    expect(replayed).toEqual({ ...created, kind: "replayed" });
    await expect(readState()).resolves.toMatchObject({
      authorityRevision: 2,
      lastCommandPresent: true,
      policyCount: 2,
      commandCount: 1,
      outcomeCount: 1,
      commandState: "succeeded",
      outcomeKind: "applied"
    });
  });

  it("rejects reuse of the same actor-scoped idempotency key for another request", async () => {
    const store = createDrizzleFlowRuntimeControlCommandStore(runtime.database);
    await replaceFlowRuntimeRolloutPolicy(commandInput(store, "runtime-policy-0002"));

    await expect(
      replaceFlowRuntimeRolloutPolicy({
        ...commandInput(store, "runtime-policy-0002"),
        reason: "A different request"
      })
    ).rejects.toBeInstanceOf(FlowRuntimeControlCommandIdempotencyConflictError);
    await expect(readState()).resolves.toMatchObject({
      authorityRevision: 2,
      policyCount: 2,
      commandCount: 1,
      outcomeCount: 1
    });
  });

  it("persists and replays a stale-revision conflict without creating a policy", async () => {
    const store = createDrizzleFlowRuntimeControlCommandStore(runtime.database);
    await replaceFlowRuntimeRolloutPolicy(commandInput(store, "runtime-policy-0003"));
    const staleInput = commandInput(store, "runtime-policy-0004");

    const created = await replaceFlowRuntimeRolloutPolicy(staleInput);
    const replayed = await replaceFlowRuntimeRolloutPolicy(staleInput);

    expect(created).toMatchObject({
      kind: "created",
      outcome: {
        kind: "revision_conflict",
        expectedRevision: 1,
        currentRevision: 2
      }
    });
    expect(replayed).toEqual({ ...created, kind: "replayed" });
    await expect(readState()).resolves.toMatchObject({
      authorityRevision: 2,
      policyCount: 2,
      commandCount: 2,
      outcomeCount: 2,
      commandState: "failed",
      outcomeKind: "revision_conflict"
    });
  });

  it("serializes concurrent commands so one applies and one receives a durable conflict", async () => {
    const store = createDrizzleFlowRuntimeControlCommandStore(runtime.database);
    const results = await Promise.all([
      replaceFlowRuntimeRolloutPolicy(commandInput(store, "runtime-policy-0005")),
      replaceFlowRuntimeRolloutPolicy(commandInput(store, "runtime-policy-0006"))
    ]);

    expect(results.map((result) => result.outcome.kind).sort()).toEqual([
      "applied",
      "revision_conflict"
    ]);
    await expect(readState()).resolves.toMatchObject({
      authorityRevision: 2,
      policyCount: 2,
      commandCount: 2,
      outcomeCount: 2
    });
  });

  it("resolves the actor subject in the same transaction as command creation", async () => {
    const freshActorUserId = randomUUID();
    await runtime.pool.query("INSERT INTO users (id) VALUES ($1)", [freshActorUserId]);
    await runtime.pool.query(`
      CREATE FUNCTION reject_flow_runtime_control_test_command()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.idempotency_key = 'runtime-policy-atomic-subject' THEN
          RAISE EXCEPTION 'forced command insert failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await runtime.pool.query(`
      CREATE TRIGGER reject_flow_runtime_control_test_command
      BEFORE INSERT ON flow_runtime_control_commands
      FOR EACH ROW EXECUTE FUNCTION reject_flow_runtime_control_test_command()
    `);

    const store = createDrizzleFlowRuntimeControlCommandStore(runtime.database);
    await expect(
      replaceFlowRuntimeRolloutPolicy({
        ...commandInput(store, "runtime-policy-atomic-subject"),
        actorUserId: freshActorUserId
      })
    ).rejects.toThrow();

    const mappings = await runtime.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_actor_subjects WHERE user_id = $1",
      [freshActorUserId]
    );
    expect(mappings.rows[0]?.count).toBe("0");
  });

  it("persists only subject identifiers outside the erasable identity mappings", async () => {
    const store = createDrizzleFlowRuntimeControlCommandStore(runtime.database);

    await replaceFlowRuntimeRolloutPolicy(commandInput(store, "runtime-policy-0007"));

    const persisted = await runtime.pool.query<{
      policy_preimage: string;
      outcome_preimage: string;
      command_row: string;
    }>(`
      SELECT policy.canonical_preimage AS policy_preimage,
             outcome.requested_policy_canonical_preimage AS outcome_preimage,
             to_jsonb(command)::text AS command_row
        FROM flow_runtime_control_commands command
        JOIN flow_runtime_control_command_outcomes outcome ON outcome.command_id = command.id
        JOIN flow_runtime_rollout_policy_versions policy ON policy.command_id = command.id
       WHERE command.idempotency_key = 'runtime-policy-0007'
    `);
    const evidence = persisted.rows[0]!;
    expect(evidence.policy_preimage).toContain(ownerSubjectId);
    expect(evidence.outcome_preimage).toContain(ownerSubjectId);
    expect(JSON.stringify(evidence)).not.toContain(ownerUserId);
    expect(JSON.stringify(evidence)).not.toContain(actorUserId);
  });

  it("blocks owner erasure while referenced and preserves historical evidence after policy N+1", async () => {
    const store = createDrizzleFlowRuntimeControlCommandStore(runtime.database);
    await replaceFlowRuntimeRolloutPolicy(commandInput(store, "runtime-policy-0008"));

    await expect(runtime.pool.query("DELETE FROM users WHERE id = $1", [ownerUserId])).rejects
      .toThrow(/current flow runtime policy still references erased owner subject/);

    await replaceFlowRuntimeRolloutPolicy({
      ...commandInput(store, "runtime-policy-0009"),
      expectedRevision: 2,
      policy: policy({
        mode: "definition_only",
        canaryOwnerSubjectIds: [],
        allowedRequirementKeys: []
      })
    });
    await runtime.pool.query("DELETE FROM users WHERE id = $1", [ownerUserId]);

    const subject = await runtime.pool.query<{ state: string; owner_user_id: string | null }>(
      "SELECT state, owner_user_id FROM flow_runtime_owner_subjects WHERE owner_subject_id = $1",
      [ownerSubjectId]
    );
    const historical = await runtime.pool.query<{ canonical_preimage: string }>(
      "SELECT canonical_preimage FROM flow_runtime_rollout_policy_versions WHERE revision = 2"
    );
    expect(subject.rows[0]).toEqual({ state: "erased", owner_user_id: null });
    expect(historical.rows[0]!.canonical_preimage).toContain(ownerSubjectId);
    expect(historical.rows[0]!.canonical_preimage).not.toContain(ownerUserId);
  });

  it("purges expired replay payload while retaining the immutable command tombstone", async () => {
    const store = createDrizzleFlowRuntimeControlCommandStore(runtime.database);
    const input = commandInput(store, "runtime-policy-0010");
    await replaceFlowRuntimeRolloutPolicy(input);
    const command = await runtime.pool.query<{ id: string }>(
      "SELECT id FROM flow_runtime_control_commands WHERE idempotency_key = 'runtime-policy-0010'"
    );
    const commandId = command.rows[0]!.id;

    await expect(
      runtime.pool.query(
        "DELETE FROM flow_runtime_control_command_outcomes WHERE command_id = $1",
        [commandId]
      )
    ).rejects.toThrow(/inside its replay window/);
    await expect(
      runtime.pool.query("DELETE FROM flow_runtime_control_commands WHERE id = $1", [commandId])
    ).rejects.toThrow(/cannot be deleted/);

    await runtime.pool.query(
      "ALTER TABLE flow_runtime_control_commands DISABLE TRIGGER flow_runtime_control_commands_transition_guard"
    );
    await runtime.pool.query(
      "ALTER TABLE flow_runtime_control_commands DISABLE TRIGGER flow_runtime_control_commands_outcome_guard"
    );
    await runtime.pool.query(
      `UPDATE flow_runtime_control_commands
          SET created_at = authority.created_at,
              replay_until = authority.created_at + interval '24 hours'
         FROM (SELECT clock_timestamp() - interval '25 hours' AS created_at) authority
        WHERE id = $1`,
      [commandId]
    );
    await runtime.pool.query(
      "ALTER TABLE flow_runtime_control_commands ENABLE TRIGGER flow_runtime_control_commands_transition_guard"
    );
    await runtime.pool.query(
      "ALTER TABLE flow_runtime_control_commands ENABLE TRIGGER flow_runtime_control_commands_outcome_guard"
    );
    await runtime.pool.query(
      "DELETE FROM flow_runtime_control_command_outcomes WHERE command_id = $1",
      [commandId]
    );

    await expect(replaceFlowRuntimeRolloutPolicy(input)).rejects.toBeInstanceOf(
      FlowRuntimeControlCommandReplayExpiredError
    );
    await expect(readState()).resolves.toMatchObject({ commandCount: 1, outcomeCount: 0 });
  });

  it("purges expired outcomes in concurrent bounded batches while retaining every command", async () => {
    const store = createDrizzleFlowRuntimeControlCommandStore(runtime.database);
    for (const [expectedRevision, idempotencyKey] of [
      [1, "runtime-retention-0001"],
      [2, "runtime-retention-0002"],
      [3, "runtime-retention-0003"]
    ] as const) {
      await replaceFlowRuntimeRolloutPolicy({
        store,
        actorUserId,
        idempotencyKey,
        expectedRevision,
        reason: "Retention integration",
        policy: policy()
      });
    }
    await runtime.pool.query(
      "ALTER TABLE flow_runtime_control_commands DISABLE TRIGGER flow_runtime_control_commands_transition_guard"
    );
    await runtime.pool.query(
      "ALTER TABLE flow_runtime_control_commands DISABLE TRIGGER flow_runtime_control_commands_outcome_guard"
    );
    await runtime.pool.query(`
      WITH aged AS (
        SELECT clock_timestamp() - interval '25 hours' AS created_at
      )
      UPDATE flow_runtime_control_commands
         SET created_at = aged.created_at,
             completed_at = aged.created_at + interval '1 minute',
             updated_at = aged.created_at + interval '1 minute',
             replay_until = aged.created_at + interval '24 hours'
        FROM aged
       WHERE target_revision IN (2, 3)
    `);
    await runtime.pool.query(
      "ALTER TABLE flow_runtime_control_commands ENABLE TRIGGER flow_runtime_control_commands_transition_guard"
    );
    await runtime.pool.query(
      "ALTER TABLE flow_runtime_control_commands ENABLE TRIGGER flow_runtime_control_commands_outcome_guard"
    );

    const results = await Promise.all([
      runFlowRuntimeControlOutcomeRetention(runtime.database, { batchSize: 1 }),
      runFlowRuntimeControlOutcomeRetention(runtime.database, { batchSize: 1 })
    ]);
    expect(results.reduce((total, result) => total + result.purged, 0)).toBe(2);
    await expect(
      runFlowRuntimeControlOutcomeRetention(runtime.database, { batchSize: 10 })
    ).resolves.toEqual({ purged: 0 });
    await expect(readState()).resolves.toMatchObject({ commandCount: 3, outcomeCount: 1 });
  });
});

function commandInput(
  store: ReturnType<typeof createDrizzleFlowRuntimeControlCommandStore>,
  idempotencyKey: string
) {
  return {
    store,
    actorUserId,
    idempotencyKey,
    expectedRevision: 1,
    reason: "Canary rollout",
    policy: policy()
  } as const;
}

function policy(
  overrides: Partial<Omit<FlowRuntimeRolloutPolicy, "revision">> = {}
): Omit<FlowRuntimeRolloutPolicy, "revision"> {
  return {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    mode: "canary",
    canaryOwnerSubjectIds: [ownerSubjectId],
    allowedRequirementKeys: [
      "executor:completed:1:1",
      "runtime:flow-interpreter.v1"
    ],
    killSwitches: {
      enrollment: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      claim: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      externalDispatch: { global: true, ownerSubjectIds: [], capabilityKeys: [] }
    },
    readinessLeaseTtlMs: 30_000,
    tokenLeaseDurationMs: 45_000,
    ...overrides
  };
}

async function readState() {
  const result = await runtime.pool.query<{
    authority_revision: number;
    last_command_present: boolean;
    policy_count: string;
    command_count: string;
    outcome_count: string;
    command_state: string | null;
    outcome_kind: string | null;
  }>(`
    SELECT authority.current_policy_revision AS authority_revision,
           authority.last_command_id IS NOT NULL AS last_command_present,
           (SELECT count(*)::text FROM flow_runtime_rollout_policy_versions) AS policy_count,
           (SELECT count(*)::text FROM flow_runtime_control_commands) AS command_count,
           (SELECT count(*)::text FROM flow_runtime_control_command_outcomes) AS outcome_count,
           (SELECT state FROM flow_runtime_control_commands ORDER BY created_at DESC, id DESC LIMIT 1)
             AS command_state,
           (SELECT result_kind FROM flow_runtime_control_command_outcomes ORDER BY created_at DESC, command_id DESC LIMIT 1)
             AS outcome_kind
      FROM flow_runtime_control_authority authority
     WHERE authority.authority_key = 'primary'
  `);
  const row = result.rows[0]!;
  return {
    authorityRevision: row.authority_revision,
    lastCommandPresent: row.last_command_present,
    policyCount: Number(row.policy_count),
    commandCount: Number(row.command_count),
    outcomeCount: Number(row.outcome_count),
    commandState: row.command_state,
    outcomeKind: row.outcome_kind
  };
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "test Flow runtime control command");
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
