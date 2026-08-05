import { randomUUID } from "node:crypto";

import {
  replaceFlowRuntimeRolloutPolicy,
  type FlowRuntimeRolloutPolicy,
  type FlowWorkerRegistration
} from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertAuditActorSubjects,
  reconcileAuditActorSubjects
} from "../scripts/audit-actor-subject-reconciliation";
import {
  assertFlowRuntimeControlAuthority,
  flowRuntimeControlAuthorityBaselineDdl,
  reconcileFlowRuntimeControlAuthority
} from "../scripts/flow-runtime-control-reconciliation";
import { createDrizzleFlowRuntimeControlCommandStore } from "./adapters/flows/drizzle-flow-runtime-control-command-store";
import { createDrizzleFlowWorkerReadinessStore } from "./adapters/flows/drizzle-flow-worker-readiness-store";
import { assertDevelopmentDatabaseUrl } from "./connection";
import type { ElevenHouseDatabase } from "./runtime";

const integrationDatabaseUrl = requireIntegrationDatabaseUrl(
  process.env.INTEGRATION_DATABASE_URL
);
const databaseName = `elevenhouse_flow_runtime_control_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
const databaseClient = new Client({ connectionString: isolatedDatabaseUrl });
const actorUserId = "00000000-0000-4000-8000-000000000099";
const ownerUserId = "00000000-0000-4000-8000-000000000001";
let database: ElevenHouseDatabase;
let ownerSubjectId: string;

describe("Flow runtime control authority PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    await databaseClient.connect();
    database = drizzle(databaseClient) as unknown as ElevenHouseDatabase;
  }, 30_000);

  afterAll(async () => {
    try {
      await databaseClient.end();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  beforeEach(async () => {
    await databaseClient.query("DROP SCHEMA public CASCADE");
    await databaseClient.query("CREATE SCHEMA public");
    await databaseClient.query("CREATE TABLE users (id uuid PRIMARY KEY)");
  });

  it("installs one fail-closed V2 authority and becomes a physical no-op", async () => {
    await expect(readRelations()).resolves.toEqual(Array(8).fill(null));

    await applyReconciliation("reconciled");
    await expect(assertAuditActorSubjects(databaseClient)).resolves.toBeUndefined();
    await expect(assertFlowRuntimeControlAuthority(databaseClient)).resolves.toBeUndefined();
    const before = await readPhysicalEvidence();
    await expect(readCurrentAuthority()).resolves.toEqual({
      authorityKey: "primary",
      controlRevision: 1,
      currentPolicyRevision: 1,
      mode: "definition_only",
      canaryOwnerSubjectIds: [],
      policyDigest:
        "sha256:8f179908494865d038955f31b1adfc69b1448e36d69a1f4eda3bfee8201f9f4c"
    });

    await applyReconciliation("already_current");
    await expect(readPhysicalEvidence()).resolves.toEqual(before);
  });

  it("initializes the immutable fail-closed authority when the current control schema has no rows", async () => {
    const schemaSql = flowRuntimeControlAuthorityBaselineDdl.split(
      "INSERT INTO flow_runtime_rollout_policy_versions",
      1
    )[0]!;
    await databaseClient.query("BEGIN");
    try {
      await reconcileAuditActorSubjects(databaseClient);
      await databaseClient.query(schemaSql);
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }

    await applyReconciliation("reconciled");
    await expect(assertFlowRuntimeControlAuthority(databaseClient)).resolves.toBeUndefined();
    await expect(readCurrentAuthority()).resolves.toMatchObject({
      authorityKey: "primary",
      controlRevision: 1,
      currentPolicyRevision: 1,
      mode: "definition_only",
      canaryOwnerSubjectIds: []
    });
  });

  it("requires an explicit caller-owned transaction", async () => {
    await expect(reconcileAuditActorSubjects(databaseClient)).rejects.toThrow(
      /transaction block/i
    );
    await expect(reconcileFlowRuntimeControlAuthority(databaseClient)).rejects.toThrow(
      /transaction block/i
    );
    await expect(readRelations()).resolves.toEqual(Array(8).fill(null));
  });

  it("rejects partial and unknown runtime-control objects without widening them", async () => {
    await databaseClient.query("CREATE TABLE flow_runtime_control_orphan (id integer)");
    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowRuntimeControlAuthority(databaseClient)).rejects.toThrow(
        /partial or drifted/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }
    await expect(
      databaseClient.query(
        "SELECT to_regclass('public.flow_runtime_control_orphan')::text AS relation"
      )
    ).resolves.toMatchObject({ rows: [{ relation: "flow_runtime_control_orphan" }] });
  });

  it("attests every immutable policy and rejects post-trigger evidence drift", async () => {
    await applyReconciliation("reconciled");
    await seedSubjects();
    await applyCanaryPolicy("runtime-policy-attestation-0001");
    await expect(assertFlowRuntimeControlAuthority(databaseClient)).resolves.toBeUndefined();

    await databaseClient.query(
      "ALTER TABLE flow_runtime_rollout_policy_versions DISABLE TRIGGER flow_runtime_rollout_policy_versions_immutable"
    );
    await databaseClient.query(
      "UPDATE flow_runtime_rollout_policy_versions SET canonical_preimage = canonical_preimage || ' ' WHERE revision = 2"
    );
    await databaseClient.query(
      "ALTER TABLE flow_runtime_rollout_policy_versions ENABLE TRIGGER flow_runtime_rollout_policy_versions_immutable"
    );
    await expect(assertFlowRuntimeControlAuthority(databaseClient)).rejects.toThrow(
      /policy evidence/i
    );
  });

  it("attests permanent command tombstones independently from deferred triggers", async () => {
    await applyReconciliation("reconciled");
    await seedSubjects();
    await applyCanaryPolicy("runtime-policy-attestation-0002");

    await databaseClient.query(
      "ALTER TABLE flow_runtime_control_commands DISABLE TRIGGER flow_runtime_control_commands_transition_guard"
    );
    await databaseClient.query(
      "ALTER TABLE flow_runtime_control_commands DISABLE TRIGGER flow_runtime_control_commands_outcome_guard"
    );
    await databaseClient.query(
      `UPDATE flow_runtime_control_commands
          SET request_hash = 'sha256:${"0".repeat(64)}'
        WHERE idempotency_key = 'runtime-policy-attestation-0002'`
    );
    await databaseClient.query(
      "ALTER TABLE flow_runtime_control_commands ENABLE TRIGGER flow_runtime_control_commands_outcome_guard"
    );
    await databaseClient.query(
      "ALTER TABLE flow_runtime_control_commands ENABLE TRIGGER flow_runtime_control_commands_transition_guard"
    );
    await expect(assertFlowRuntimeControlAuthority(databaseClient)).rejects.toThrow(
      /inconsistent/i
    );
  });

  it("attests worker registration digests independently from mutation triggers", async () => {
    await applyReconciliation("reconciled");
    await seedSubjects();
    const readiness = createDrizzleFlowWorkerReadinessStore(database);
    await readiness.register(workerRegistration(randomUUID()));
    await expect(assertFlowRuntimeControlAuthority(databaseClient)).resolves.toBeUndefined();

    await databaseClient.query(
      "ALTER TABLE flow_worker_registrations DISABLE TRIGGER flow_worker_registrations_immutable"
    );
    await databaseClient.query(
      `UPDATE flow_worker_registrations SET registration_digest = 'sha256:${"0".repeat(64)}'`
    );
    await databaseClient.query(
      "ALTER TABLE flow_worker_registrations ENABLE TRIGGER flow_worker_registrations_immutable"
    );
    await expect(assertFlowRuntimeControlAuthority(databaseClient)).rejects.toThrow(
      /inconsistent/i
    );
  });
});

async function applyReconciliation(
  expected: "reconciled" | "already_current"
): Promise<void> {
  await databaseClient.query("BEGIN");
  try {
    await reconcileAuditActorSubjects(databaseClient);
    await expect(reconcileFlowRuntimeControlAuthority(databaseClient)).resolves.toBe(expected);
    await databaseClient.query("COMMIT");
  } catch (error) {
    await databaseClient.query("ROLLBACK");
    throw error;
  }
}

async function seedSubjects(): Promise<void> {
  await databaseClient.query("INSERT INTO users (id) VALUES ($1), ($2)", [
    actorUserId,
    ownerUserId
  ]);
  const owner = await databaseClient.query<{ owner_subject_id: string }>(
    "INSERT INTO flow_runtime_owner_subjects (owner_user_id) VALUES ($1) RETURNING owner_subject_id",
    [ownerUserId]
  );
  ownerSubjectId = owner.rows[0]!.owner_subject_id;
}

async function applyCanaryPolicy(idempotencyKey: string): Promise<void> {
  await replaceFlowRuntimeRolloutPolicy({
    store: createDrizzleFlowRuntimeControlCommandStore(database),
    actorUserId,
    idempotencyKey,
    expectedRevision: 1,
    policy: rolloutPolicy(),
    reason: "Integration canary policy"
  });
}

function rolloutPolicy(): Omit<FlowRuntimeRolloutPolicy, "revision"> {
  return {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    mode: "canary",
    canaryOwnerSubjectIds: [ownerSubjectId],
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
}

function workerRegistration(sessionId: string): FlowWorkerRegistration {
  return {
    schemaVersion: "flow-worker-registration.v2",
    sessionId,
    instanceId: "flows-worker-attestation",
    roles: ["enrollment", "executor"],
    maxRuntimeMode: "canary",
    maxCanaryOwnerSubjectIds: [ownerSubjectId],
    requirementKeys: ["executor:completed:1:1", "runtime:flow-interpreter.v1"],
    deploymentId: "deployment-attestation",
    buildId: "build-attestation"
  };
}

async function readRelations(): Promise<readonly (string | null)[]> {
  const result = await databaseClient.query<{ relation: string | null }>(`
    SELECT to_regclass(candidate)::text AS relation
      FROM unnest(ARRAY[
        'public.flow_runtime_owner_subjects',
        'public.flow_runtime_control_commands',
        'public.flow_runtime_control_command_outcomes',
        'public.flow_runtime_rollout_policy_versions',
        'public.flow_runtime_control_authority',
        'public.flow_worker_registrations',
        'public.flow_worker_registration_tombstones',
        'public.flow_worker_readiness_leases'
      ]) WITH ORDINALITY AS relations(candidate, position)
     ORDER BY position
  `);
  return result.rows.map((row) => row.relation);
}

async function readCurrentAuthority() {
  const result = await databaseClient.query<{
    authority_key: string;
    control_revision: number;
    current_policy_revision: number;
    mode: string;
    canary_owner_subject_ids: string[];
    policy_digest: string;
  }>(`
    SELECT authority.authority_key, authority.control_revision,
           authority.current_policy_revision, policy.mode,
           policy.canary_owner_subject_ids, policy.policy_digest
      FROM flow_runtime_control_authority authority
      JOIN flow_runtime_rollout_policy_versions policy
        ON policy.revision = authority.current_policy_revision
     WHERE authority.authority_key = 'primary'
  `);
  const row = result.rows[0]!;
  return {
    authorityKey: row.authority_key,
    controlRevision: row.control_revision,
    currentPolicyRevision: row.current_policy_revision,
    mode: row.mode,
    canaryOwnerSubjectIds: row.canary_owner_subject_ids,
    policyDigest: row.policy_digest
  };
}

async function readPhysicalEvidence() {
  const result = await databaseClient.query<{
    relation_oids: string[];
    policy_xmins: string[];
    authority_xmin: string;
  }>(`
    SELECT ARRAY(
             SELECT relation.oid::text
               FROM pg_class relation
               JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
              WHERE namespace.nspname = 'public'
                AND relation.relname LIKE ANY(ARRAY[
                  'flow_runtime_control_%', 'flow_runtime_owner_%',
                  'flow_runtime_rollout_policy_%', 'flow_worker_readiness_%',
                  'flow_worker_registration%'
                ])
              ORDER BY relation.relname
           ) AS relation_oids,
           ARRAY(
             SELECT xmin::text FROM flow_runtime_rollout_policy_versions ORDER BY revision
           ) AS policy_xmins,
           (SELECT xmin::text FROM flow_runtime_control_authority WHERE authority_key = 'primary')
             AS authority_xmin
  `);
  return result.rows[0]!;
}

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "test Flow runtime control");
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
