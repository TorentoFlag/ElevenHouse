import { readCurrentMigrationSql } from "./testing/current-migration-sql";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { reconcileAuditActorSubjects } from "../scripts/audit-actor-subject-reconciliation";
import {
  assertFlowEnrollmentControl,
  reconcileFlowEnrollmentControl
} from "../scripts/flow-enrollment-control-reconciliation";
import { reconcileFlowRuntimeControlAuthority } from "../scripts/flow-runtime-control-reconciliation";
import { assertDevelopmentDatabaseUrl } from "./connection";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const integrationBaselineSql = process.env.FLOW_INTEGRATION_BASELINE_PATH
  ? readFileSync(process.env.FLOW_INTEGRATION_BASELINE_PATH, "utf8")
  : readCurrentMigrationSql();
const databaseName = `elevenhouse_flow_enrollment_reconciliation_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let pool: Pool;

describe("Flow enrollment control production reconciliation integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
  }, 30_000);

  afterAll(async () => {
    try {
      await pool?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query(integrationBaselineSql);
    await inTransaction(async (client) => {
      await reconcileAuditActorSubjects(client);
      await reconcileFlowRuntimeControlAuthority(client);
    });
  }, 30_000);

  it("attests the exact generated current catalog as a no-op", async () => {
    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).resolves.toBe(
      "already_current"
    );
    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).resolves.toBe(
      "already_current"
    );
    await expect(inTransaction((client) => assertFlowEnrollmentControl(client))).resolves.toBe(
      undefined
    );
  });

  it("backfills read authority for existing flow owners without an enrollment command", async () => {
    const ownerUserId = randomUUID();
    await pool.query("INSERT INTO users (id) VALUES ($1)", [ownerUserId]);
    await pool.query(
      `INSERT INTO flows (
         owner_user_id, name, status, definition_state, approval_mode, revision,
         draft_graph, created_at, updated_at
       ) VALUES (
         $1, 'Existing flow', 'draft', 'draft', 'manual_approve', 1,
         $2, transaction_timestamp(), transaction_timestamp()
       )`,
      [
        ownerUserId,
        {
          schemaVersion: "flow-graph.v2",
          nodes: [
            {
              id: "manual",
              category: "trigger",
              kind: "manual",
              title: "Manual",
              config: {}
            }
          ],
          edges: []
        }
      ]
    );

    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).resolves.toBe(
      "already_current"
    );
    await expect(
      pool.query<{ subjects: string; quotas: string }>(
        `SELECT
           (SELECT count(*)::text FROM flow_runtime_owner_subjects
             WHERE owner_user_id = $1 AND state = 'active') AS subjects,
           (SELECT count(*)::text
              FROM flow_automation_quota_authorities quota
              JOIN flow_runtime_owner_subjects subject USING (owner_subject_id)
             WHERE subject.owner_user_id = $1) AS quotas`,
        [ownerUserId]
      )
    ).resolves.toMatchObject({ rows: [{ subjects: "1", quotas: "1" }] });
  });

  it("serializes concurrent reconcilers to one upgrade and one current attestation", async () => {
    await downgradeToGeneratedBaseline();

    const results = await Promise.all([
      inTransaction((client) => reconcileFlowEnrollmentControl(client)),
      inTransaction((client) => reconcileFlowEnrollmentControl(client))
    ]);
    expect(results.sort()).toEqual(["already_current", "reconciled"]);
    await expect(inTransaction((client) => assertFlowEnrollmentControl(client))).resolves.toBe(
      undefined
    );
  });

  it("repairs the omitted runtime extension and then attests a no-op replay", async () => {
    await downgradeEnrollmentRuntimeExtension();

    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).resolves.toBe(
      "reconciled"
    );
    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).resolves.toBe(
      "already_current"
    );
    await expect(inTransaction((client) => assertFlowEnrollmentControl(client))).resolves.toBe(
      undefined
    );
  });

  it("repairs the exact omitted runtime integrity catalog", async () => {
    await downgradeEnrollmentRuntimeIntegrity();

    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).resolves.toBe(
      "reconciled"
    );
    await expect(readEnrollmentRuntimeIntegrityEvidence()).resolves.toEqual({
      functions: "2",
      triggers: "3"
    });
    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).resolves.toBe(
      "already_current"
    );
    await expect(inTransaction((client) => assertFlowEnrollmentControl(client))).resolves.toBe(
      undefined
    );
  });

  it("upgrades the exact empty generated catalog", async () => {
    await downgradeToGeneratedBaseline();

    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).resolves.toBe(
      "reconciled"
    );
    await expect(inTransaction((client) => assertFlowEnrollmentControl(client))).resolves.toBe(
      undefined
    );
  });

  it("installs the complete authority when the enrollment catalog is absent", async () => {
    await downgradeEnrollmentRuntimeExtension();
    await dropEnrollmentCatalog();

    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).resolves.toBe(
      "reconciled"
    );
    await expect(inTransaction((client) => assertFlowEnrollmentControl(client))).resolves.toBe(
      undefined
    );
  });

  it("adds enrollment provenance to the exact legacy runtime shape without rewriting history", async () => {
    await downgradeEnrollmentRuntimeExtension();
    await dropEnrollmentCatalog();
    await installLegacyRuntimeHistory();
    const historyBefore = await readLegacyRuntimeHistory();

    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).resolves.toBe(
      "reconciled"
    );
    await expect(readLegacyRuntimeHistory()).resolves.toEqual(historyBefore);
    await expect(readEnrollmentRuntimeExtensionEvidence()).resolves.toEqual({
      columns: "16",
      constraints: "4",
      indexes: "2",
      populatedProvenanceFields: "0"
    });
    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).resolves.toBe(
      "already_current"
    );
    await expect(inTransaction((client) => assertFlowEnrollmentControl(client))).resolves.toBe(
      undefined
    );
  });

  it("refuses the generated transition after any enrollment data was written", async () => {
    await downgradeToGeneratedBaseline();
    const userId = randomUUID();
    await pool.query("INSERT INTO users (id) VALUES ($1)", [userId]);
    await pool.query("INSERT INTO audit_actor_subjects (kind, user_id) VALUES ('user', $1)", [
      userId
    ]);
    const subject = await pool.query<{ owner_subject_id: string }>(
      "INSERT INTO flow_runtime_owner_subjects (owner_user_id) VALUES ($1) RETURNING owner_subject_id",
      [userId]
    );
    await pool.query(
      `INSERT INTO flow_enrollment_commands (
         actor_subject_id, owner_subject_id, route_template, resource_id, command_scope,
         idempotency_key, request_hash, replay_until
       ) VALUES (
         (SELECT actor_subject_id FROM audit_actor_subjects WHERE user_id = $1),
         $2, '/flows/:flowId/activate', $3, 'flows.enrollment.activate.v1',
         'written-before-upgrade', $4, transaction_timestamp() + interval '24 hours'
       )`,
      [userId, subject.rows[0]!.owner_subject_id, randomUUID(), `sha256:${"a".repeat(64)}`]
    );

    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).rejects.toThrow(
      "after enrollment data was written"
    );
  });

  it("rechecks generated-baseline emptiness after waiting for a legacy writer", async () => {
    await downgradeToGeneratedBaseline();
    const fixture = await installLegacyEnrollmentCommandPrerequisites();
    const writer = await pool.connect();
    const reconciler = await pool.connect();
    let writerCommitted = false;

    try {
      await writer.query("BEGIN");
      await writer.query(
        `INSERT INTO flow_enrollment_commands (
           actor_subject_id, owner_subject_id, route_template, resource_id, command_scope,
           idempotency_key, request_hash, replay_until
         ) VALUES ($1, $2, '/flows/:flowId/activate', $3, 'flows.enrollment.activate.v1',
                   'concurrent-legacy-write', $4, transaction_timestamp() + interval '24 hours')`,
        [fixture.actorSubjectId, fixture.ownerSubjectId, randomUUID(), `sha256:${"b".repeat(64)}`]
      );

      await reconciler.query("BEGIN");
      const reconcilerPid = await reconciler.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid"
      );
      const outcome = reconcileFlowEnrollmentControl(reconciler as unknown as Client).then(
        (value) => ({ kind: "resolved" as const, value }),
        (error: unknown) => ({ kind: "rejected" as const, error })
      );

      await waitForBackendLock(reconcilerPid.rows[0]!.pid);
      await writer.query("COMMIT");
      writerCommitted = true;

      const result = await outcome;
      expect(result.kind).toBe("rejected");
      if (result.kind === "resolved") {
        throw new Error(`Expected reconciliation rejection, received ${result.value}`);
      }
      expect(result.error).toBeInstanceOf(Error);
      expect((result.error as Error).message).toContain("after enrollment data was written");
      await reconciler.query("ROLLBACK");

      await expect(
        pool.query<{ column_name: string }>(`
          SELECT column_name
            FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'flow_enrollment_commands'
             AND column_name = 'request_schema_version'
        `)
      ).resolves.toMatchObject({ rows: [] });
    } finally {
      if (!writerCommitted) await writer.query("ROLLBACK");
      await reconciler.query("ROLLBACK").catch(() => undefined);
      writer.release();
      reconciler.release();
    }
  });

  it("bounds enrollment upgrade locks", async () => {
    await downgradeToGeneratedBaseline();

    await inTransaction(async (client) => {
      await expect(reconcileFlowEnrollmentControl(client)).resolves.toBe("reconciled");
      await expect(
        client.query<{ lock_timeout: string }>("SHOW lock_timeout")
      ).resolves.toMatchObject({ rows: [{ lock_timeout: "5s" }] });
    });
  });

  it("rejects a partial catalog instead of repairing it heuristically", async () => {
    await pool.query("DROP INDEX flow_enrollment_commands_replay_until_idx");

    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).rejects.toThrow(
      "partial or drifted Flow enrollment control catalog"
    );
  });

  it("rejects a partial runtime extension instead of guessing the missing object", async () => {
    await pool.query("DROP INDEX flow_runtime_events_source_identity_unique");

    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).rejects.toThrow(
      "partial or drifted Flow enrollment runtime extension catalog"
    );
  });

  it("rejects a partial runtime integrity catalog instead of guessing the missing guard", async () => {
    await pool.query("DROP TRIGGER flow_runtime_events_truncate_guard ON flow_runtime_events");

    await expect(inTransaction((client) => reconcileFlowEnrollmentControl(client))).rejects.toThrow(
      "partial or drifted Flow enrollment runtime integrity catalog"
    );
  });
});

async function downgradeToGeneratedBaseline(): Promise<void> {
  await pool.query(`
    DROP FUNCTION IF EXISTS flow_assert_activation_epoch_command_provenance() CASCADE;
    DROP FUNCTION IF EXISTS flow_assert_automation_quota_consistency() CASCADE;
    DROP FUNCTION IF EXISTS flow_assert_enrollment_command_outcome() CASCADE;
    DROP FUNCTION IF EXISTS flow_assert_enrollment_control_provenance() CASCADE;
    DROP FUNCTION IF EXISTS flow_guard_activation_epoch_close() CASCADE;
    DROP FUNCTION IF EXISTS flow_guard_automation_quota_transition() CASCADE;
    DROP FUNCTION IF EXISTS flow_guard_enrollment_command_transition() CASCADE;
    DROP FUNCTION IF EXISTS flow_guard_enrollment_control_transition() CASCADE;
    DROP FUNCTION IF EXISTS flow_guard_enrollment_outcome_mutation() CASCADE;
    DROP FUNCTION IF EXISTS flow_prepare_enrollment_command() CASCADE;
    DROP FUNCTION IF EXISTS flow_reject_activation_epoch_removal() CASCADE;
    DROP FUNCTION IF EXISTS flow_reject_enrollment_authority_removal() CASCADE;
    DROP FUNCTION IF EXISTS flow_reject_enrollment_command_removal() CASCADE;
    DROP TABLE flow_automation_quota_authorities CASCADE;
    ALTER TABLE flow_enrollment_controls
      DROP CONSTRAINT flow_enrollment_controls_owner_subject_fk,
      DROP COLUMN owner_subject_id;
    ALTER TABLE flow_enrollment_commands
      DROP CONSTRAINT flow_enrollment_commands_request_shape_check,
      DROP COLUMN request_schema_version,
      DROP COLUMN target_version_id,
      DROP COLUMN expected_definition_revision,
      DROP COLUMN expected_enrollment_revision,
      DROP COLUMN expected_active_version_id,
      DROP COLUMN expected_activation_epoch_id
  `);
}

async function installLegacyEnrollmentCommandPrerequisites(): Promise<{
  readonly actorSubjectId: string;
  readonly ownerSubjectId: string;
}> {
  const userId = randomUUID();
  await pool.query("INSERT INTO users (id) VALUES ($1)", [userId]);
  const actor = await pool.query<{ actor_subject_id: string }>(
    "INSERT INTO audit_actor_subjects (kind, user_id) VALUES ('user', $1) RETURNING actor_subject_id",
    [userId]
  );
  const subject = await pool.query<{ owner_subject_id: string }>(
    "INSERT INTO flow_runtime_owner_subjects (owner_user_id) VALUES ($1) RETURNING owner_subject_id",
    [userId]
  );
  return {
    actorSubjectId: actor.rows[0]!.actor_subject_id,
    ownerSubjectId: subject.rows[0]!.owner_subject_id
  };
}

async function waitForBackendLock(pid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const state = await pool.query<{ wait_event_type: string | null }>(
      "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
      [pid]
    );
    if (state.rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Backend ${pid} did not wait for a relation lock`);
}

async function downgradeEnrollmentRuntimeExtension(): Promise<void> {
  await downgradeEnrollmentRuntimeIntegrity();
  await pool.query(`
    DROP INDEX IF EXISTS flow_runtime_events_source_identity_unique;
    ALTER TABLE flow_runtime_events
      DROP CONSTRAINT IF EXISTS flow_runtime_events_normalized_shape_check,
      DROP CONSTRAINT IF EXISTS flow_runtime_events_payload_digest_check,
      DROP COLUMN IF EXISTS event_kind,
      DROP COLUMN IF EXISTS occurrence_key,
      DROP COLUMN IF EXISTS payload_schema_version,
      DROP COLUMN IF EXISTS payload_digest,
      DROP COLUMN IF EXISTS classification,
      DROP COLUMN IF EXISTS redaction_version,
      DROP COLUMN IF EXISTS retention_policy_id,
      DROP COLUMN IF EXISTS ingestion_outcome,
      DROP COLUMN IF EXISTS processed_at;

    DROP INDEX IF EXISTS flow_runs_owner_stable_enrollment_unique;
    ALTER TABLE flow_runs
      DROP CONSTRAINT IF EXISTS flow_runs_activation_epoch_fk,
      DROP CONSTRAINT IF EXISTS flow_runs_enrollment_shape_check,
      DROP COLUMN IF EXISTS activation_epoch_id,
      DROP COLUMN IF EXISTS trigger_node_id,
      DROP COLUMN IF EXISTS occurrence_key,
      DROP COLUMN IF EXISTS enrollment_policy_key,
      DROP COLUMN IF EXISTS enrollment_policy_revision,
      DROP COLUMN IF EXISTS execution_authority_basis,
      DROP COLUMN IF EXISTS execution_authority_ref_id
  `);
}

async function downgradeEnrollmentRuntimeIntegrity(): Promise<void> {
  await pool.query(`
    DROP TRIGGER IF EXISTS flow_runs_enrollment_immutable ON flow_runs;
    DROP TRIGGER IF EXISTS flow_runtime_events_immutable ON flow_runtime_events;
    DROP TRIGGER IF EXISTS flow_runtime_events_truncate_guard ON flow_runtime_events;
    DROP FUNCTION IF EXISTS elevenhouse_guard_flow_run_enrollment_mutation();
    DROP FUNCTION IF EXISTS elevenhouse_guard_flow_runtime_event_mutation();
  `);
}

async function readEnrollmentRuntimeIntegrityEvidence(): Promise<{
  readonly functions: string;
  readonly triggers: string;
}> {
  const result = await pool.query<{ functions: string; triggers: string }>(`
    SELECT
      (SELECT count(*)::text
         FROM pg_proc procedure
         JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure.proname IN (
            'elevenhouse_guard_flow_run_enrollment_mutation',
            'elevenhouse_guard_flow_runtime_event_mutation'
          )) AS functions,
      (SELECT count(*)::text
         FROM pg_trigger trigger_record
         JOIN pg_class relation ON relation.oid = trigger_record.tgrelid
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND NOT trigger_record.tgisinternal
          AND trigger_record.tgname IN (
            'flow_runs_enrollment_immutable',
            'flow_runtime_events_immutable',
            'flow_runtime_events_truncate_guard'
          )) AS triggers
  `);
  return result.rows[0]!;
}

async function dropEnrollmentCatalog(): Promise<void> {
  await pool.query(`
    DROP TABLE flow_enrollment_controls,
               flow_activation_epochs,
               flow_enrollment_command_outcomes,
               flow_enrollment_commands,
               flow_automation_quota_authorities
    CASCADE;
    DROP FUNCTION IF EXISTS flow_assert_activation_epoch_command_provenance() CASCADE;
    DROP FUNCTION IF EXISTS flow_assert_automation_quota_consistency() CASCADE;
    DROP FUNCTION IF EXISTS flow_assert_enrollment_command_outcome() CASCADE;
    DROP FUNCTION IF EXISTS flow_assert_enrollment_control_provenance() CASCADE;
    DROP FUNCTION IF EXISTS flow_guard_activation_epoch_close() CASCADE;
    DROP FUNCTION IF EXISTS flow_guard_automation_quota_transition() CASCADE;
    DROP FUNCTION IF EXISTS flow_guard_enrollment_command_transition() CASCADE;
    DROP FUNCTION IF EXISTS flow_guard_enrollment_control_transition() CASCADE;
    DROP FUNCTION IF EXISTS flow_guard_enrollment_outcome_mutation() CASCADE;
    DROP FUNCTION IF EXISTS flow_prepare_enrollment_command() CASCADE;
    DROP FUNCTION IF EXISTS flow_reject_activation_epoch_removal() CASCADE;
    DROP FUNCTION IF EXISTS flow_reject_enrollment_authority_removal() CASCADE;
    DROP FUNCTION IF EXISTS flow_reject_enrollment_command_removal() CASCADE
  `);
}

async function installLegacyRuntimeHistory(): Promise<void> {
  await pool.query(`
    INSERT INTO users (id, status)
    VALUES ('b1000000-0000-4000-8000-000000000001', 'active');

    INSERT INTO flows (
      id, owner_user_id, name, origin, status, definition_state, approval_mode,
      revision, draft_graph, draft_presentation, created_at, updated_at
    ) VALUES (
      'b2000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      'Enrollment reconciliation fixture',
      '{"schemaVersion":"flow-definition-origin.v1","type":"blank"}',
      'draft', 'draft', 'manual_approve', 1,
      '{"schemaVersion":"flow-graph.v2","nodes":[{"id":"completed","kind":"completed","displayTitle":"Completed","configSchemaVersion":1,"executorContractVersion":1,"config":{"goalKey":"done"}}],"edges":[]}',
      '{"schemaVersion":"flow-presentation.v1","nodes":[{"nodeId":"completed","position":{"x":0,"y":0}}],"viewport":{"x":0,"y":0,"zoom":1}}',
      '2026-08-03T10:00:00Z', '2026-08-03T10:00:00Z'
    );

    INSERT INTO flow_versions (
      id, flow_id, owner_user_id, version, source_revision, approval_mode,
      graph_schema_version, graph, presentation, capability_manifest, published_at
    ) VALUES (
      'b3000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      1, 1, 'manual_approve', 'flow-graph.v2',
      '{"schemaVersion":"flow-graph.v2","nodes":[{"id":"completed","kind":"completed","displayTitle":"Completed","configSchemaVersion":1,"executorContractVersion":1,"config":{"goalKey":"done"}}],"edges":[]}',
      '{"schemaVersion":"flow-presentation.v1","nodes":[{"nodeId":"completed","position":{"x":0,"y":0}}],"viewport":{"x":0,"y":0,"zoom":1}}',
      '{"schemaVersion":"flow-capability-manifest.v1","executionSemanticsVersion":"flow-interpreter.v1","nodeExecutors":[{"kind":"completed","configSchemaVersion":1,"executorContractVersion":1}],"requiredCapabilities":[]}',
      '2026-08-03T10:01:00Z'
    );

    UPDATE flows
       SET status = 'published', definition_state = 'versioned',
           published_version_id = 'b3000000-0000-4000-8000-000000000001',
           published_at = '2026-08-03T10:01:00Z'
     WHERE id = 'b2000000-0000-4000-8000-000000000001';

    INSERT INTO flow_runtime_events (
      id, owner_user_id, source, source_event_id, dedupe_key, subject_type,
      subject_id, occurred_at, payload, created_at
    ) VALUES (
      'b4000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      'manual', 'enrollment-reconciliation-fixture', 'enrollment-reconciliation-fixture',
      'client', 'b5000000-0000-4000-8000-000000000001',
      '2026-08-03T10:02:00Z', '{}', '2026-08-03T10:02:00Z'
    );

    INSERT INTO flow_runs (
      id, owner_user_id, flow_id, flow_version_id, runtime_event_id, status,
      snapshot, current_node_id, trace_sequence, completed_at, created_at, updated_at
    ) VALUES (
      'b6000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      'b4000000-0000-4000-8000-000000000001',
      'completed', '{"schemaVersion":"flow-run-snapshot.v2"}', 'completed', 1,
      '2026-08-03T10:04:00Z',
      '2026-08-03T10:03:00Z', '2026-08-03T10:03:00Z'
    )
  `);
}

async function readLegacyRuntimeHistory(): Promise<{
  readonly events: readonly Record<string, unknown>[];
  readonly runs: readonly Record<string, unknown>[];
}> {
  const [events, runs] = await Promise.all([
    pool.query(`
      SELECT xmin::text AS row_version, ctid::text AS row_location,
             id, owner_user_id, source, source_event_id, dedupe_key, subject_type,
             subject_id, occurred_at::text, payload::text, created_at::text
        FROM flow_runtime_events
       WHERE id = 'b4000000-0000-4000-8000-000000000001'
    `),
    pool.query(`
      SELECT xmin::text AS row_version, ctid::text AS row_location,
             id, owner_user_id, flow_id, flow_version_id, runtime_event_id, status,
             snapshot::text, current_node_id, trace_sequence::text,
             completed_at::text, created_at::text, updated_at::text
        FROM flow_runs
       WHERE id = 'b6000000-0000-4000-8000-000000000001'
    `)
  ]);
  return { events: events.rows, runs: runs.rows };
}

async function readEnrollmentRuntimeExtensionEvidence(): Promise<{
  readonly columns: string;
  readonly constraints: string;
  readonly indexes: string;
  readonly populatedProvenanceFields: string;
}> {
  const result = await pool.query<{
    columns: string;
    constraints: string;
    indexes: string;
    populated_provenance_fields: string;
  }>(`
    SELECT
      (SELECT count(*)::text
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name, column_name) IN (
            ('flow_runtime_events', 'event_kind'),
            ('flow_runtime_events', 'occurrence_key'),
            ('flow_runtime_events', 'payload_schema_version'),
            ('flow_runtime_events', 'payload_digest'),
            ('flow_runtime_events', 'classification'),
            ('flow_runtime_events', 'redaction_version'),
            ('flow_runtime_events', 'retention_policy_id'),
            ('flow_runtime_events', 'ingestion_outcome'),
            ('flow_runtime_events', 'processed_at'),
            ('flow_runs', 'activation_epoch_id'),
            ('flow_runs', 'trigger_node_id'),
            ('flow_runs', 'occurrence_key'),
            ('flow_runs', 'enrollment_policy_key'),
            ('flow_runs', 'enrollment_policy_revision'),
            ('flow_runs', 'execution_authority_basis'),
            ('flow_runs', 'execution_authority_ref_id')
          )) AS columns,
      (SELECT count(*)::text
         FROM pg_constraint
        WHERE conname IN (
          'flow_runtime_events_normalized_shape_check',
          'flow_runtime_events_payload_digest_check',
          'flow_runs_activation_epoch_fk',
          'flow_runs_enrollment_shape_check'
        )) AS constraints,
      (SELECT count(*)::text
         FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'flow_runtime_events_source_identity_unique',
            'flow_runs_owner_stable_enrollment_unique'
          )) AS indexes,
      ((SELECT count(*) FROM flow_runtime_events
         WHERE event_kind IS NOT NULL OR occurrence_key IS NOT NULL
            OR payload_schema_version IS NOT NULL OR payload_digest IS NOT NULL
            OR classification IS NOT NULL OR redaction_version IS NOT NULL
            OR retention_policy_id IS NOT NULL OR ingestion_outcome IS NOT NULL
            OR processed_at IS NOT NULL)
       +
       (SELECT count(*) FROM flow_runs
         WHERE activation_epoch_id IS NOT NULL OR trigger_node_id IS NOT NULL
            OR occurrence_key IS NOT NULL OR enrollment_policy_key IS NOT NULL
            OR enrollment_policy_revision IS NOT NULL
            OR execution_authority_basis IS NOT NULL
            OR execution_authority_ref_id IS NOT NULL))::text AS populated_provenance_fields
  `);
  const row = result.rows[0]!;
  return {
    columns: row.columns,
    constraints: row.constraints,
    indexes: row.indexes,
    populatedProvenanceFields: row.populated_provenance_fields
  };
}

async function inTransaction<T>(operation: (client: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client as unknown as Client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  return assertDevelopmentDatabaseUrl(
    value,
    process.env.NODE_ENV,
    "test Flow enrollment reconciliation"
  );
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
