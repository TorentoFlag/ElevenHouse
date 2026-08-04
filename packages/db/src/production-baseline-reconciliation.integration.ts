import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { storedChartCalculationPayloadSchema } from "@elevenhouse/contracts";
import {
  calculateNumerologyCompatibility,
  calculateNumerologyIndividual,
  sha256CanonicalJson,
  type CanonicalJson
} from "@elevenhouse/domain";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reconcileChartCalculationJobsIfPrerequisitesExist } from "../scripts/chart-calculation-jobs-reconciliation";
import {
  currentBaseline,
  flowExecutionRetrySafetyBaselineDdl,
  flowOutboxSafetyBaselineDdl,
  previousAtomicAdvanceBaseline,
  previousBaseline,
  previousCancellationKernelBaseline,
  previousFlowDefinitionControlBaseline,
  previousFlowSafetyBaseline,
  previousRuntimeKernelBaseline
} from "../scripts/production-baseline-plan";

const execFileAsync = promisify(execFile);
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;
const validLegacyFlowGraph = {
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "manual",
      title: "Manual enrollment",
      category: "trigger",
      kind: "manual",
      config: {}
    },
    {
      id: "completed-node",
      title: "Completed",
      category: "terminal",
      kind: "completed",
      config: {}
    }
  ],
  edges: [
    {
      id: "manual-completed",
      fromNodeId: "manual",
      toNodeId: "completed-node"
    }
  ]
} as const;
const validLegacyFlowGraphJson = JSON.stringify(validLegacyFlowGraph);
const validLegacyFlowGraphWithoutSchemaJson = JSON.stringify(
  Object.fromEntries(
    Object.entries(validLegacyFlowGraph).filter(([key]) => key !== "schemaVersion")
  )
);

describeWithDatabase("production baseline reconciliation", () => {
  const databaseName = `elevenhouse_reconcile_${randomUUID().replaceAll("-", "")}`;
  let adminClient: Client;
  let databaseClient: Client;
  let databaseUrl: string;

  beforeAll(async () => {
    const sourceUrl = new URL(integrationDatabaseUrl!);
    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = "/postgres";
    databaseUrl = new URL(sourceUrl).toString();
    const targetUrl = new URL(databaseUrl);
    targetUrl.pathname = `/${databaseName}`;
    databaseUrl = targetUrl.toString();

    adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE ${databaseName}`);

    databaseClient = new Client({ connectionString: databaseUrl });
    await databaseClient.connect();
    await databaseClient.query(legacyProductionFixtureSql());
  }, 30_000);

  afterAll(async () => {
    await databaseClient?.end();
    if (adminClient) {
      await adminClient.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await adminClient.end();
    }
  });

  it("moves the approved legacy schema and data to the current baseline idempotently", async () => {
    const firstRun = await runReconciler(databaseUrl);

    expect(firstRun, firstRun.output).toMatchObject({ exitCode: 0 });
    expect(firstRun.output).toContain("Legacy production baseline reconciled");

    const state = await databaseClient.query<{
      current_baseline_count: string;
      legacy_versions_table: string | null;
      pdf_jobs_table: string | null;
      matrix_notes_table: string | null;
      availability_schedules_table: string | null;
      schedule_reservations_table: string | null;
      calculation_client_links_table: string | null;
      calculation_client_links_row_count: string;
      calculation_client_links_base_index_count: string;
      calculation_client_links_calculation_fk_count: string;
      calculation_client_links_visibility_default: string | null;
      exclusion_count: string;
      request_fingerprint: string;
      result_checksum: string;
      result_data: unknown;
      input_data: unknown;
    }>(`
      SELECT
        (SELECT count(*)::text
           FROM drizzle.__drizzle_migrations
          WHERE hash = '${currentBaseline.hash}'
            AND created_at = ${currentBaseline.createdAt}) AS current_baseline_count,
        to_regclass('public.calculation_versions')::text AS legacy_versions_table,
        to_regclass('public.calculation_pdf_jobs')::text AS pdf_jobs_table,
        to_regclass('public.matrix_notes')::text AS matrix_notes_table,
        to_regclass('public.availability_schedules')::text AS availability_schedules_table,
        to_regclass('public.schedule_reservations')::text AS schedule_reservations_table,
        to_regclass('public.calculation_client_links')::text AS calculation_client_links_table,
        (SELECT count(*)::text FROM calculation_client_links)
          AS calculation_client_links_row_count,
        (SELECT count(*)::text
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'calculation_client_links'
            AND indexname IN (
              'calculation_client_links_record_idx',
              'calculation_client_links_client_idx',
              'calculation_client_links_record_client_unique'
            )) AS calculation_client_links_base_index_count,
        (SELECT count(*)::text
           FROM pg_constraint
          WHERE conname = 'calculation_client_links_calculation_id_calculation_records_id_fk'
            AND contype = 'f'
            AND pg_get_constraintdef(oid, false) =
              'FOREIGN KEY (calculation_id) REFERENCES calculation_records(id) ON DELETE CASCADE')
          AS calculation_client_links_calculation_fk_count,
        (SELECT column_default
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'calculation_client_links'
            AND column_name = 'visibility') AS calculation_client_links_visibility_default,
        (SELECT count(*)::text FROM pg_constraint
          WHERE conname = 'schedule_reservations_active_owner_range_exclude'
            AND contype = 'x') AS exclusion_count,
        request_fingerprint,
        result_checksum,
        result_data,
        input_data
      FROM calculation_records
      WHERE id = '10000000-0000-0000-0000-000000000001'
    `);

    expect(state.rows[0]).toMatchObject({
      current_baseline_count: "1",
      legacy_versions_table: null,
      pdf_jobs_table: "calculation_pdf_jobs",
      matrix_notes_table: "matrix_notes",
      availability_schedules_table: "availability_schedules",
      schedule_reservations_table: "schedule_reservations",
      calculation_client_links_table: "calculation_client_links",
      calculation_client_links_row_count: "0",
      calculation_client_links_base_index_count: "3",
      calculation_client_links_calculation_fk_count: "1",
      calculation_client_links_visibility_default: "'private_to_astrologer'::text",
      exclusion_count: "1",
      result_checksum: sha256CanonicalJson(currentResult),
      result_data: currentResult,
      input_data: currentInputData
    });
    expect(state.rows[0]?.request_fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);

    const defaultLink = await databaseClient.query<{
      visibility: string;
      published_at: Date | null;
      published_interpretation_id: string | null;
      published_result_checksum: string | null;
    }>(`
      INSERT INTO calculation_client_links (id, calculation_id, client_id, linked_at)
      VALUES (
        '41000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        '2026-08-03T10:00:00.000Z'
      )
      RETURNING visibility, published_at, published_interpretation_id, published_result_checksum
    `);
    expect(defaultLink.rows[0]).toEqual({
      visibility: "private_to_astrologer",
      published_at: null,
      published_interpretation_id: null,
      published_result_checksum: null
    });

    const compatibilityState = await databaseClient.query<{
      result_checksum: string;
      result_data: unknown;
      input_data: unknown;
    }>(`
      SELECT result_checksum, result_data, input_data
        FROM calculation_records
       WHERE id = '10000000-0000-0000-0000-000000000002'
    `);
    expect(compatibilityState.rows[0]).toMatchObject({
      result_checksum: sha256CanonicalJson(currentCompatibilityResult),
      result_data: currentCompatibilityResult,
      input_data: currentCompatibilityInputData
    });

    const secondRun = await runReconciler(databaseUrl);
    expect(secondRun.exitCode).toBe(0);
    expect(secondRun.output).toContain("Current production baseline is already recorded");
  }, 30_000);

  it("moves the approved previous baseline to scheduling without touching existing data", async () => {
    const previousDatabaseName = `elevenhouse_previous_${randomUUID().replaceAll("-", "")}`;
    const previousUrl = new URL(integrationDatabaseUrl!);
    previousUrl.pathname = `/${previousDatabaseName}`;
    let previousClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${previousDatabaseName}`);
      previousClient = new Client({ connectionString: previousUrl.toString() });
      await previousClient.connect();
      await previousClient.query(previousProductionFixtureSql());

      const run = await runReconciler(previousUrl.toString());
      expect(run, run.output).toMatchObject({ exitCode: 0 });
      expect(run.output).toContain("Previous production baseline reconciled");

      const state = await previousClient.query<{
        current_baseline_count: string;
        product_title: string;
        schedule_table: string | null;
        exclusion_count: string;
        birth_primary_count: string;
        birth_primary_unique_count: string;
        birth_old_unique_count: string;
        booking_shape_column_count: string;
        booking_state_check_count: string;
        booking_source_check_count: string;
        booking_hold_expiry_check_count: string;
        flow_definition_commands_table: string | null;
        flow_definition_command_outcomes_table: string | null;
        flow_definition_migrations_table: string | null;
        published_flow_definition_state: string;
        published_flow_revision: number;
        published_flow_draft_base_version_id: string | null;
        published_flow_draft_presentation: unknown | null;
        published_flow_origin: unknown | null;
        published_flow_graph_schema_version: string;
        draft_flow_definition_state: string;
        draft_flow_revision: number;
        draft_flow_graph_schema_version: string;
        flow_version_source_revision: number | null;
        flow_version_graph_schema_version: string | null;
        flow_version_embedded_schema_version: string;
        flow_version_presentation: unknown | null;
        flow_version_capability_manifest: unknown | null;
        flow_lifecycle_constraint_count: string;
        flow_source_revision_unique_count: string;
        flow_definition_state_index_count: string;
        canonical_publication_fk_count: string;
        flow_integrity_trigger_count: string;
      }>(`
        SELECT
          (SELECT count(*)::text
             FROM drizzle.__drizzle_migrations
            WHERE hash = '${currentBaseline.hash}'
              AND created_at = ${currentBaseline.createdAt}) AS current_baseline_count,
          (SELECT title FROM products WHERE id = '50000000-0000-0000-0000-000000000001') AS product_title,
          to_regclass('public.availability_schedules')::text AS schedule_table,
          (SELECT count(*)::text FROM pg_constraint
            WHERE conname = 'schedule_reservations_active_owner_range_exclude'
              AND contype = 'x') AS exclusion_count,
          (SELECT count(*)::text FROM client_birth_data WHERE is_primary = true) AS birth_primary_count,
          (SELECT count(*)::text FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'client_birth_data'
              AND indexname = 'client_birth_data_primary_unique') AS birth_primary_unique_count,
          (SELECT count(*)::text FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'client_birth_data'
              AND indexname = 'client_birth_data_client_unique') AS birth_old_unique_count,
          (SELECT count(*)::text
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'bookings'
              AND column_name IN ('source', 'hold_expires_at')) AS booking_shape_column_count,
          (SELECT count(*)::text
             FROM pg_constraint
            WHERE conrelid = 'bookings'::regclass
              AND conname = 'bookings_state_check'
              AND pg_get_constraintdef(oid) LIKE '%pending_payment%'
              AND pg_get_constraintdef(oid) LIKE '%expired%') AS booking_state_check_count,
          (SELECT count(*)::text
             FROM pg_constraint
            WHERE conrelid = 'bookings'::regclass
              AND conname = 'bookings_source_check'
              AND pg_get_constraintdef(oid) LIKE '%client_paid%') AS booking_source_check_count,
          (SELECT count(*)::text
             FROM pg_constraint
            WHERE conrelid = 'bookings'::regclass
              AND conname = 'bookings_hold_expiry_check'
              AND pg_get_constraintdef(oid) LIKE '%hold_expires_at%') AS booking_hold_expiry_check_count,
          to_regclass('public.flow_definition_commands')::text AS flow_definition_commands_table,
          to_regclass('public.flow_definition_command_outcomes')::text AS flow_definition_command_outcomes_table,
          to_regclass('public.flow_definition_migrations')::text AS flow_definition_migrations_table,
          (SELECT definition_state FROM flows
            WHERE id = '60000000-0000-0000-0000-000000000001') AS published_flow_definition_state,
          (SELECT revision FROM flows
            WHERE id = '60000000-0000-0000-0000-000000000001') AS published_flow_revision,
          (SELECT draft_base_version_id FROM flows
            WHERE id = '60000000-0000-0000-0000-000000000001') AS published_flow_draft_base_version_id,
          (SELECT draft_presentation FROM flows
            WHERE id = '60000000-0000-0000-0000-000000000001') AS published_flow_draft_presentation,
          (SELECT origin FROM flows
            WHERE id = '60000000-0000-0000-0000-000000000001') AS published_flow_origin,
          (SELECT draft_graph->>'schemaVersion' FROM flows
            WHERE id = '60000000-0000-0000-0000-000000000001') AS published_flow_graph_schema_version,
          (SELECT definition_state FROM flows
            WHERE id = '60000000-0000-0000-0000-000000000002') AS draft_flow_definition_state,
          (SELECT revision FROM flows
            WHERE id = '60000000-0000-0000-0000-000000000002') AS draft_flow_revision,
          (SELECT draft_graph->>'schemaVersion' FROM flows
            WHERE id = '60000000-0000-0000-0000-000000000002') AS draft_flow_graph_schema_version,
          (SELECT source_revision FROM flow_versions
            WHERE id = '70000000-0000-0000-0000-000000000001') AS flow_version_source_revision,
          (SELECT graph_schema_version FROM flow_versions
            WHERE id = '70000000-0000-0000-0000-000000000001') AS flow_version_graph_schema_version,
          (SELECT graph->>'schemaVersion' FROM flow_versions
            WHERE id = '70000000-0000-0000-0000-000000000001') AS flow_version_embedded_schema_version,
          (SELECT presentation FROM flow_versions
            WHERE id = '70000000-0000-0000-0000-000000000001') AS flow_version_presentation,
          (SELECT capability_manifest FROM flow_versions
            WHERE id = '70000000-0000-0000-0000-000000000001') AS flow_version_capability_manifest,
          (SELECT count(*)::text FROM pg_constraint
            WHERE conrelid = 'flows'::regclass
              AND conname = 'flows_definition_lifecycle_check') AS flow_lifecycle_constraint_count,
          (SELECT count(*)::text FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'flow_versions'
              AND indexname = 'flow_versions_flow_source_revision_unique') AS flow_source_revision_unique_count,
          (SELECT count(*)::text FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'flows'
              AND indexname = 'flows_owner_definition_state_updated_idx') AS flow_definition_state_index_count,
          (SELECT count(*)::text FROM pg_constraint
            WHERE conrelid = 'flows'::regclass
              AND conname = 'flows_published_version_owner_fk'
              AND pg_get_constraintdef(oid) =
                'FOREIGN KEY (id, published_version_id, owner_user_id, published_at) REFERENCES flow_versions(flow_id, id, owner_user_id, published_at) ON DELETE RESTRICT') AS canonical_publication_fk_count,
          (SELECT count(*)::text FROM pg_trigger
            WHERE NOT tgisinternal
              AND tgrelid IN (
                'flows'::regclass,
                'flow_versions'::regclass,
                'flow_definition_commands'::regclass,
                'flow_definition_command_outcomes'::regclass,
                'flow_definition_migrations'::regclass
              )
              AND tgname IN (
                'flow_versions_immutable_update',
                'flow_versions_delete_with_aggregate_only',
                'flow_publication_pointer_consistency',
                'flow_version_pointer_consistency',
                'flow_definition_commands_immutable_identity',
                'flow_definition_command_outcomes_retention',
                'flow_definition_command_outcome_consistency',
                'flow_definition_outcome_command_consistency',
                'flow_definition_migrations_immutable'
              )) AS flow_integrity_trigger_count
      `);
      expect(state.rows[0]).toEqual({
        current_baseline_count: "1",
        product_title: "Persisted product",
        schedule_table: "availability_schedules",
        exclusion_count: "1",
        birth_primary_count: "1",
        birth_primary_unique_count: "1",
        birth_old_unique_count: "0",
        booking_shape_column_count: "2",
        booking_state_check_count: "1",
        booking_source_check_count: "1",
        booking_hold_expiry_check_count: "1",
        flow_definition_commands_table: "flow_definition_commands",
        flow_definition_command_outcomes_table: "flow_definition_command_outcomes",
        flow_definition_migrations_table: "flow_definition_migrations",
        published_flow_definition_state: "versioned",
        published_flow_revision: 1,
        published_flow_draft_base_version_id: null,
        published_flow_draft_presentation: null,
        published_flow_origin: null,
        published_flow_graph_schema_version: "flow-graph.v1",
        draft_flow_definition_state: "draft",
        draft_flow_revision: 1,
        draft_flow_graph_schema_version: "flow-graph.v1",
        flow_version_source_revision: null,
        flow_version_graph_schema_version: null,
        flow_version_embedded_schema_version: "flow-graph.v1",
        flow_version_presentation: null,
        flow_version_capability_manifest: null,
        flow_lifecycle_constraint_count: "1",
        flow_source_revision_unique_count: "1",
        flow_definition_state_index_count: "1",
        canonical_publication_fk_count: "1",
        flow_integrity_trigger_count: "9"
      });

      await previousClient.query(`
        ALTER TABLE flows DROP CONSTRAINT flows_definition_lifecycle_check;
        ALTER TABLE flows
          ADD CONSTRAINT flows_definition_lifecycle_check CHECK (revision > 0);
      `);
      const driftedConstraint = await previousClient.query<{ definition: string }>(`
        SELECT pg_get_constraintdef(oid) AS definition
          FROM pg_constraint
         WHERE conrelid = 'flows'::regclass
           AND conname = 'flows_definition_lifecycle_check'
      `);

      const currentRun = await runReconciler(previousUrl.toString());
      expect(currentRun.exitCode).not.toBe(0);

      const driftedState = await previousClient.query<{
        current_baseline_count: string;
        definition: string;
      }>(`
        SELECT
          (SELECT count(*)::text
             FROM drizzle.__drizzle_migrations
            WHERE hash = '${currentBaseline.hash}'
              AND created_at = ${currentBaseline.createdAt}) AS current_baseline_count,
          pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'flows'::regclass
          AND conname = 'flows_definition_lifecycle_check'
      `);
      expect(driftedState.rows[0]).toEqual({
        current_baseline_count: "1",
        definition: driftedConstraint.rows[0]?.definition
      });
    } finally {
      await previousClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${previousDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("adds durable cancellation control without rewriting execution history", async () => {
    const cancellationDatabaseName = `elevenhouse_previous_cancellation_${randomUUID().replaceAll("-", "")}`;
    const cancellationUrl = new URL(integrationDatabaseUrl!);
    cancellationUrl.pathname = `/${cancellationDatabaseName}`;
    let cancellationClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${cancellationDatabaseName}`);
      cancellationClient = new Client({ connectionString: cancellationUrl.toString() });
      await cancellationClient.connect();
      await cancellationClient.query(
        readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8")
      );
      await installCompletedFlowExecutionFixture(cancellationClient);
      await downgradeFlowRunCancellation(cancellationClient);
      await installPreviousCancellationKernelLedger(cancellationClient);
      const evidenceBefore = await readFlowExecutionEvidence(cancellationClient);

      const run = await runReconciler(cancellationUrl.toString());
      expect(run, run.output).toMatchObject({ exitCode: 0 });
      expect(run.output).toContain("Previous Flows cancellation baseline reconciled");
      await expect(readFlowExecutionEvidence(cancellationClient)).resolves.toEqual(evidenceBefore);

      const state = await cancellationClient.query<{
        current_baseline_count: string;
        previous_baseline_count: string;
        command_count: string;
        outcome_count: string;
        token_count: string;
        attempt_count: string;
        event_count: string;
        unlinked_event_count: string;
        integrity_trigger_count: string;
        integrity_function_count: string;
      }>(`
        SELECT
          (SELECT count(*)::text FROM drizzle.__drizzle_migrations
            WHERE hash = '${currentBaseline.hash}'
              AND created_at = ${currentBaseline.createdAt}) AS current_baseline_count,
          (SELECT count(*)::text FROM drizzle.__drizzle_migrations
            WHERE hash = '${previousCancellationKernelBaseline.hash}'
              AND created_at = ${previousCancellationKernelBaseline.createdAt})
            AS previous_baseline_count,
          (SELECT count(*)::text FROM flow_runtime_commands) AS command_count,
          (SELECT count(*)::text FROM flow_runtime_command_outcomes) AS outcome_count,
          (SELECT count(*)::text FROM flow_execution_tokens) AS token_count,
          (SELECT count(*)::text FROM flow_execution_attempts) AS attempt_count,
          (SELECT count(*)::text FROM flow_run_events) AS event_count,
          (SELECT count(*)::text FROM flow_run_events WHERE command_id IS NULL)
            AS unlinked_event_count,
          (SELECT count(*)::text
             FROM pg_trigger
            WHERE NOT tgisinternal
              AND tgname IN (
                'flow_execution_attempts_immutable',
                'flow_execution_attempts_truncate_guard',
                'flow_run_events_immutable',
                'flow_run_events_truncate_guard',
                'flow_runtime_commands_immutable_identity',
                'flow_runtime_command_outcomes_retention',
                'flow_runtime_command_outcome_consistency',
                'flow_runtime_outcome_command_consistency',
                'flow_run_event_command_consistency'
              )) AS integrity_trigger_count,
          (SELECT count(*)::text
             FROM pg_proc
            WHERE proname IN (
              'elevenhouse_guard_flow_execution_history_mutation',
              'elevenhouse_guard_flow_runtime_command_mutation',
              'elevenhouse_guard_flow_runtime_outcome_mutation',
              'elevenhouse_assert_flow_runtime_command_outcome',
              'elevenhouse_assert_flow_run_event_command'
            )) AS integrity_function_count
      `);
      expect(state.rows[0]).toEqual({
        current_baseline_count: "1",
        previous_baseline_count: "1",
        command_count: "0",
        outcome_count: "0",
        token_count: "1",
        attempt_count: "1",
        event_count: "1",
        unlinked_event_count: "1",
        integrity_trigger_count: "9",
        integrity_function_count: "5"
      });

      const evidenceBeforeNoop = await readFlowExecutionEvidence(cancellationClient);
      const secondRun = await runReconciler(cancellationUrl.toString());
      expect(secondRun.exitCode).toBe(0);
      expect(secondRun.output).toContain("Current production baseline is already recorded");
      await expect(readFlowExecutionEvidence(cancellationClient)).resolves.toEqual(
        evidenceBeforeNoop
      );
    } finally {
      await cancellationClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${cancellationDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("adds the terminal-token runtime kernel without fabricating execution history", async () => {
    const runtimeDatabaseName = `elevenhouse_previous_runtime_${randomUUID().replaceAll("-", "")}`;
    const runtimeUrl = new URL(integrationDatabaseUrl!);
    runtimeUrl.pathname = `/${runtimeDatabaseName}`;
    let runtimeClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${runtimeDatabaseName}`);
      runtimeClient = new Client({ connectionString: runtimeUrl.toString() });
      await runtimeClient.connect();
      await runtimeClient.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
      await runtimeClient.query(`
        DROP TABLE chart_calculation_jobs;
        DROP FUNCTION elevenhouse_guard_chart_job_result_checksum_mutation();
      `);
      await runtimeClient.query(`
        BEGIN;
        INSERT INTO users (id) VALUES ('81000000-0000-4000-8000-000000000001');
        INSERT INTO flows (
          id, owner_user_id, name, status, definition_state, approval_mode, revision,
          draft_graph, created_at, updated_at
        ) VALUES (
          '82000000-0000-4000-8000-000000000001',
          '81000000-0000-4000-8000-000000000001',
          'Persisted runtime flow',
          'draft',
          'draft',
          'manual_approve',
          1,
          '${validLegacyFlowGraphJson}',
          '2026-08-03T10:00:00.000Z',
          '2026-08-03T10:00:00.000Z'
        );
        INSERT INTO flow_versions (
          id, flow_id, owner_user_id, version, approval_mode, graph, published_at
        ) VALUES (
          '83000000-0000-4000-8000-000000000001',
          '82000000-0000-4000-8000-000000000001',
          '81000000-0000-4000-8000-000000000001',
          1,
          'manual_approve',
          '${validLegacyFlowGraphJson}',
          '2026-08-03T10:01:00.000Z'
        );
        UPDATE flows
           SET status = 'active',
               definition_state = 'versioned',
               published_version_id = '83000000-0000-4000-8000-000000000001',
               published_at = '2026-08-03T10:01:00.000Z'
         WHERE id = '82000000-0000-4000-8000-000000000001';
        INSERT INTO flow_runtime_events (
          id, owner_user_id, source, source_event_id, dedupe_key, subject_type, subject_id,
          occurred_at, payload
        ) VALUES (
          '84000000-0000-4000-8000-000000000001',
          '81000000-0000-4000-8000-000000000001',
          'manual',
          'persisted-runtime-event',
          'persisted-runtime-event',
          'manual',
          'persisted-runtime-subject',
          '2026-08-03T10:02:00.000Z',
          '{}'
        );
        INSERT INTO flow_runs (
          id, owner_user_id, flow_id, flow_version_id, runtime_event_id, status, snapshot
        ) VALUES (
          '85000000-0000-4000-8000-000000000001',
          '81000000-0000-4000-8000-000000000001',
          '82000000-0000-4000-8000-000000000001',
          '83000000-0000-4000-8000-000000000001',
          '84000000-0000-4000-8000-000000000001',
          'pending',
          '{}'
        );
        COMMIT;
      `);
      await downgradeFlowExecutionRuntime(runtimeClient);
      await runtimeClient.query(`
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('${previousRuntimeKernelBaseline.hash}', ${previousRuntimeKernelBaseline.createdAt});
      `);

      const run = await runReconciler(runtimeUrl.toString());
      expect(run, run.output).toMatchObject({ exitCode: 0 });
      expect(run.output).toContain("Previous Flows runtime baseline reconciled");

      const state = await runtimeClient.query<{
        current_baseline_count: string;
        previous_baseline_count: string;
        persisted_run_count: string;
        trace_sequence: string;
        execution_token_count: string;
        execution_attempt_count: string;
        run_event_count: string;
        history_trigger_count: string;
      }>(`
        SELECT
          (SELECT count(*)::text FROM drizzle.__drizzle_migrations
            WHERE hash = '${currentBaseline.hash}'
              AND created_at = ${currentBaseline.createdAt}) AS current_baseline_count,
          (SELECT count(*)::text FROM drizzle.__drizzle_migrations
            WHERE hash = '${previousRuntimeKernelBaseline.hash}'
              AND created_at = ${previousRuntimeKernelBaseline.createdAt}) AS previous_baseline_count,
          (SELECT count(*)::text FROM flow_runs
            WHERE id = '85000000-0000-4000-8000-000000000001') AS persisted_run_count,
          (SELECT trace_sequence::text FROM flow_runs
            WHERE id = '85000000-0000-4000-8000-000000000001') AS trace_sequence,
          (SELECT count(*)::text FROM flow_execution_tokens) AS execution_token_count,
          (SELECT count(*)::text FROM flow_execution_attempts) AS execution_attempt_count,
          (SELECT count(*)::text FROM flow_run_events) AS run_event_count,
          (SELECT count(*)::text FROM pg_trigger
            WHERE NOT tgisinternal
              AND tgname IN (
                'flow_execution_attempts_immutable',
                'flow_execution_attempts_truncate_guard',
                'flow_run_events_immutable',
                'flow_run_events_truncate_guard'
              ))
            AS history_trigger_count
      `);
      expect(state.rows[0]).toEqual({
        current_baseline_count: "1",
        previous_baseline_count: "1",
        persisted_run_count: "1",
        trace_sequence: "0",
        execution_token_count: "0",
        execution_attempt_count: "0",
        run_event_count: "0",
        history_trigger_count: "4"
      });

      const secondRun = await runReconciler(runtimeUrl.toString());
      expect(secondRun.exitCode).toBe(0);
      expect(secondRun.output).toContain("Current production baseline is already recorded");
    } finally {
      await runtimeClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${runtimeDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("rejects a drifted predecessor runtime catalog without recording the current baseline", async () => {
    const driftDatabaseName = `elevenhouse_runtime_drift_${randomUUID().replaceAll("-", "")}`;
    const driftUrl = new URL(integrationDatabaseUrl!);
    driftUrl.pathname = `/${driftDatabaseName}`;
    let driftClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${driftDatabaseName}`);
      driftClient = new Client({ connectionString: driftUrl.toString() });
      await driftClient.connect();
      await driftClient.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
      await driftClient.query("DROP TABLE chart_calculation_jobs");
      await downgradeFlowExecutionRuntime(driftClient);
      await driftClient.query(`
        ALTER TABLE flow_runs ADD COLUMN unrecognized_runtime_state text;
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('${previousRuntimeKernelBaseline.hash}', ${previousRuntimeKernelBaseline.createdAt});
      `);

      const run = await runReconciler(driftUrl.toString());
      expect(run.exitCode).not.toBe(0);
      expect(run.output).toContain("approved predecessor Flows runtime catalog drifted");

      const ledger = await driftClient.query<{ current_baseline_count: string }>(`
        SELECT count(*)::text AS current_baseline_count
          FROM drizzle.__drizzle_migrations
         WHERE hash = '${currentBaseline.hash}'
           AND created_at = ${currentBaseline.createdAt}
      `);
      expect(ledger.rows[0]?.current_baseline_count).toBe("0");
    } finally {
      await driftClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${driftDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("rejects a missing runtime catalog when the predecessor runtime baseline is recorded", async () => {
    const missingDatabaseName = `elevenhouse_runtime_missing_${randomUUID().replaceAll("-", "")}`;
    const missingUrl = new URL(integrationDatabaseUrl!);
    missingUrl.pathname = `/${missingDatabaseName}`;
    let missingClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${missingDatabaseName}`);
      missingClient = new Client({ connectionString: missingUrl.toString() });
      await missingClient.connect();
      await missingClient.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
      await missingClient.query(`
        DROP TABLE chart_calculation_jobs;
        DROP TABLE
          flow_suppressions,
          flow_delivery_attempts,
          flow_approvals,
          flow_step_runs,
          flow_run_events,
          flow_execution_attempts,
          flow_execution_tokens,
          flow_runs,
          flow_runtime_events
        CASCADE;
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('${previousRuntimeKernelBaseline.hash}', ${previousRuntimeKernelBaseline.createdAt});
      `);

      const run = await runReconciler(missingUrl.toString());
      expect(run.exitCode).not.toBe(0);
      expect(run.output).toContain("approved predecessor Flows runtime catalog drifted");

      const ledger = await missingClient.query<{ current_baseline_count: string }>(`
        SELECT count(*)::text AS current_baseline_count
          FROM drizzle.__drizzle_migrations
         WHERE hash = '${currentBaseline.hash}'
           AND created_at = ${currentBaseline.createdAt}
      `);
      expect(ledger.rows[0]?.current_baseline_count).toBe("0");
    } finally {
      await missingClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${missingDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("rejects a current runtime catalog with a disabled history trigger", async () => {
    const disabledDatabaseName = `elevenhouse_runtime_trigger_disabled_${randomUUID().replaceAll("-", "")}`;
    const disabledUrl = new URL(integrationDatabaseUrl!);
    disabledUrl.pathname = `/${disabledDatabaseName}`;
    let disabledClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${disabledDatabaseName}`);
      disabledClient = new Client({ connectionString: disabledUrl.toString() });
      await disabledClient.connect();
      await disabledClient.query(
        readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8")
      );
      await disabledClient.query(`
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('${currentBaseline.hash}', ${currentBaseline.createdAt});
        ALTER TABLE flow_execution_attempts
          DISABLE TRIGGER flow_execution_attempts_immutable;
      `);

      const run = await runReconciler(disabledUrl.toString());
      expect(run.exitCode).not.toBe(0);
      expect(run.output).toContain("partial or drifted Flow execution safety catalog");

      const trigger = await disabledClient.query<{ enabled: string }>(`
        SELECT tgenabled AS enabled
          FROM pg_trigger
         WHERE tgrelid = 'flow_execution_attempts'::regclass
           AND tgname = 'flow_execution_attempts_immutable'
      `);
      expect(trigger.rows[0]?.enabled).toBe("D");
    } finally {
      await disabledClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${disabledDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("rejects a current baseline with a drifted run-event command integrity function", async () => {
    const driftedDatabaseName = `elevenhouse_run_event_function_drift_${randomUUID().replaceAll("-", "")}`;
    const driftedUrl = new URL(integrationDatabaseUrl!);
    driftedUrl.pathname = `/${driftedDatabaseName}`;
    let driftedClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${driftedDatabaseName}`);
      driftedClient = new Client({ connectionString: driftedUrl.toString() });
      await driftedClient.connect();
      await driftedClient.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
      await driftedClient.query(`
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('${currentBaseline.hash}', ${currentBaseline.createdAt});

        CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_run_event_command()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $flow_run_event_command_guard$
        BEGIN
          RETURN NULL;
        END;
        $flow_run_event_command_guard$;
      `);

      const run = await runReconciler(driftedUrl.toString());
      expect(run.exitCode).not.toBe(0);
      expect(run.output).toContain("partial or drifted Flow execution safety catalog");
    } finally {
      await driftedClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${driftedDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("accepts the exact checked-in current baseline with every present module", async () => {
    const currentDatabaseName = `elevenhouse_current_baseline_${randomUUID().replaceAll("-", "")}`;
    const currentUrl = new URL(integrationDatabaseUrl!);
    currentUrl.pathname = `/${currentDatabaseName}`;
    let currentClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${currentDatabaseName}`);
      currentClient = new Client({ connectionString: currentUrl.toString() });
      await currentClient.connect();
      await currentClient.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
      await currentClient.query(`
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('${currentBaseline.hash}', ${currentBaseline.createdAt});
      `);
      await installCurrentChartNoopSentinel(currentClient);
      const evidenceBefore = await readChartReconciliationEvidence(currentClient);
      await expect(readCurrentFlowAdditiveSafetyEvidence(currentClient)).resolves.toEqual({
        completedNodeConstraintCount: "0",
        manifestConstraintCount: "0"
      });

      const run = await runReconciler(currentUrl.toString());
      expect(run, run.output).toMatchObject({ exitCode: 0 });
      expect(run.output).toContain(
        "Current production baseline is already recorded; additive safety is current"
      );
      await expect(readChartReconciliationEvidence(currentClient)).resolves.toEqual(evidenceBefore);
      await expect(readCurrentFlowAdditiveSafetyEvidence(currentClient)).resolves.toEqual({
        completedNodeConstraintCount: "1",
        manifestConstraintCount: "1"
      });

      const safetyEvidence = await readCurrentFlowAdditiveSafetyEvidence(currentClient);
      const secondRun = await runReconciler(currentUrl.toString());
      expect(secondRun, secondRun.output).toMatchObject({ exitCode: 0 });
      await expect(readCurrentFlowAdditiveSafetyEvidence(currentClient)).resolves.toEqual(
        safetyEvidence
      );
    } finally {
      await currentClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${currentDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("reconciles the approved Flow safety predecessor before the real Drizzle migrator", async () => {
    const predecessorDatabaseName = `elevenhouse_previous_flow_safety_${randomUUID().replaceAll(
      "-",
      ""
    )}`;
    const predecessorUrl = new URL(integrationDatabaseUrl!);
    predecessorUrl.pathname = `/${predecessorDatabaseName}`;
    let predecessorClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${predecessorDatabaseName}`);
      predecessorClient = new Client({ connectionString: predecessorUrl.toString() });
      await predecessorClient.connect();
      await predecessorClient.query(
        readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8")
      );
      await installCompletedFlowExecutionFixture(predecessorClient);
      await downgradeFlowSafety(predecessorClient);
      await predecessorClient.query(`
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('${previousFlowSafetyBaseline.hash}', ${previousFlowSafetyBaseline.createdAt});
      `);
      const evidenceBefore = await readFlowExecutionEvidence(predecessorClient);

      const firstReconciliation = await runReconciler(predecessorUrl.toString());
      expect(firstReconciliation, firstReconciliation.output).toMatchObject({ exitCode: 0 });
      expect(firstReconciliation.output).toContain(
        "Previous Flow safety baseline reconciled to the current baseline"
      );
      await expect(readFlowExecutionEvidence(predecessorClient)).resolves.toEqual(evidenceBefore);

      const migration = await runMigrator(predecessorUrl.toString());
      expect(migration, migration.output).toMatchObject({ exitCode: 0 });
      await expect(readFlowExecutionEvidence(predecessorClient)).resolves.toEqual(evidenceBefore);

      const secondReconciliation = await runReconciler(predecessorUrl.toString());
      expect(secondReconciliation, secondReconciliation.output).toMatchObject({ exitCode: 0 });
      expect(secondReconciliation.output).toContain(
        "Current production baseline is already recorded"
      );

      const ledger = await predecessorClient.query<{ hash: string; created_at: string }>(`
        SELECT hash, created_at::text
          FROM drizzle.__drizzle_migrations
         ORDER BY created_at, id
      `);
      expect(ledger.rows).toEqual([
        {
          hash: previousFlowSafetyBaseline.hash,
          created_at: previousFlowSafetyBaseline.createdAt
        },
        { hash: currentBaseline.hash, created_at: currentBaseline.createdAt }
      ]);
    } finally {
      await predecessorClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${predecessorDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("reconciles the immediate atomic-advance predecessor before the real Drizzle migrator", async () => {
    const predecessorDatabaseName = `elevenhouse_previous_atomic_advance_${randomUUID().replaceAll(
      "-",
      ""
    )}`;
    const predecessorUrl = new URL(integrationDatabaseUrl!);
    predecessorUrl.pathname = `/${predecessorDatabaseName}`;
    let predecessorClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${predecessorDatabaseName}`);
      predecessorClient = new Client({ connectionString: predecessorUrl.toString() });
      await predecessorClient.connect();
      await predecessorClient.query(
        readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8")
      );
      await installCompletedFlowExecutionFixture(predecessorClient);
      await downgradeFlowAtomicAdvance(predecessorClient);
      await predecessorClient.query(`
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('${previousAtomicAdvanceBaseline.hash}', ${previousAtomicAdvanceBaseline.createdAt});
      `);
      const evidenceBefore = await readFlowExecutionEvidence(predecessorClient);

      const firstReconciliation = await runReconciler(predecessorUrl.toString());
      expect(firstReconciliation, firstReconciliation.output).toMatchObject({ exitCode: 0 });
      expect(firstReconciliation.output).toContain(
        "Previous Flows atomic-advance baseline reconciled to the current baseline"
      );
      await expect(readFlowExecutionEvidence(predecessorClient)).resolves.toEqual(evidenceBefore);
      await expect(readFlowActivationEvidence(predecessorClient)).resolves.toEqual({
        attempts: ["1"],
        tokens: ["1"]
      });

      const migration = await runMigrator(predecessorUrl.toString());
      expect(migration, migration.output).toMatchObject({ exitCode: 0 });
      await expect(readFlowExecutionEvidence(predecessorClient)).resolves.toEqual(evidenceBefore);

      const secondReconciliation = await runReconciler(predecessorUrl.toString());
      expect(secondReconciliation, secondReconciliation.output).toMatchObject({ exitCode: 0 });
      expect(secondReconciliation.output).toContain(
        "Current production baseline is already recorded"
      );

      const ledger = await predecessorClient.query<{ hash: string; created_at: string }>(`
        SELECT hash, created_at::text
          FROM drizzle.__drizzle_migrations
         ORDER BY created_at, id
      `);
      expect(ledger.rows).toEqual([
        {
          hash: previousAtomicAdvanceBaseline.hash,
          created_at: previousAtomicAdvanceBaseline.createdAt
        },
        { hash: currentBaseline.hash, created_at: currentBaseline.createdAt }
      ]);
    } finally {
      await predecessorClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${predecessorDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it.each([
    [
      "Flow execution authority",
      `ALTER TABLE flow_run_events SET UNLOGGED;
       ALTER TABLE flow_execution_attempts SET UNLOGGED;
       ALTER TABLE flow_execution_tokens SET UNLOGGED;`,
      /partial or drifted Flow execution safety catalog/
    ],
    [
      "Flow outbox authority",
      "ALTER TABLE outbox_events SET UNLOGGED;",
      /Flow outbox safety catalog/
    ],
    [
      "Flow runtime outcome durability",
      "ALTER TABLE flow_runtime_command_outcomes SET UNLOGGED;",
      /current Flows runtime catalog drifted/
    ],
    [
      "Flow runtime command RLS",
      "ALTER TABLE flow_runtime_commands ENABLE ROW LEVEL SECURITY;",
      /current Flows runtime catalog drifted/
    ],
    [
      "Flow runtime command constraint validation",
      `ALTER TABLE flow_runtime_commands
         DROP CONSTRAINT flow_runtime_commands_state_check,
         ADD CONSTRAINT flow_runtime_commands_state_check
           CHECK (state IN ('processing', 'succeeded', 'failed')) NOT VALID;`,
      /current Flows runtime catalog drifted/
    ],
    [
      "Flow runtime command function configuration",
      `ALTER FUNCTION elevenhouse_guard_flow_runtime_command_mutation()
         SET search_path = pg_catalog, public;`,
      /current Flows runtime-command integrity functions drifted/
    ]
  ])(
    "rejects physical or function drift on the current %s relation",
    async (_label, driftDdl, expectedError) => {
      const driftedDatabaseName = `elevenhouse_current_unlogged_${randomUUID().replaceAll("-", "")}`;
      const driftedUrl = new URL(integrationDatabaseUrl!);
      driftedUrl.pathname = `/${driftedDatabaseName}`;
      let driftedClient: Client | undefined;

      try {
        await adminClient.query(`CREATE DATABASE ${driftedDatabaseName}`);
        driftedClient = new Client({ connectionString: driftedUrl.toString() });
        await driftedClient.connect();
        await driftedClient.query(
          readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8")
        );
        await driftedClient.query(`
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('${currentBaseline.hash}', ${currentBaseline.createdAt});
        ${driftDdl}
      `);

        const run = await runReconciler(driftedUrl.toString());
        expect(run.exitCode).not.toBe(0);
        expect(run.output).toMatch(expectedError);
      } finally {
        await driftedClient?.end();
        await adminClient.query(`DROP DATABASE IF EXISTS ${driftedDatabaseName} WITH (FORCE)`);
      }
    },
    60_000
  );

  it("adds nullable interpretation authority to the exact prior chart-job catalog without backfill", async () => {
    const predecessorDatabaseName = `elevenhouse_chart_interpretation_predecessor_${randomUUID().replaceAll("-", "")}`;
    const predecessorUrl = new URL(integrationDatabaseUrl!);
    predecessorUrl.pathname = `/${predecessorDatabaseName}`;
    let predecessorClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${predecessorDatabaseName}`);
      predecessorClient = new Client({ connectionString: predecessorUrl.toString() });
      await predecessorClient.connect();
      await predecessorClient.query(
        readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8")
      );
      await installCurrentChartNoopSentinel(predecessorClient);
      await predecessorClient.query(`
        ALTER TABLE chart_calculation_jobs
          DROP CONSTRAINT chart_calculation_jobs_interpretation_mode_check,
          DROP COLUMN interpretation_mode
      `);

      await predecessorClient.query("BEGIN");
      await reconcileChartCalculationJobsIfPrerequisitesExist(predecessorClient);
      await predecessorClient.query("COMMIT");

      const state = await predecessorClient.query<{
        column_count: string;
        constraint_count: string;
        interpretation_mode: string | null;
      }>(`
        SELECT
          (SELECT count(*)::text
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'chart_calculation_jobs') AS column_count,
          (SELECT count(*)::text
             FROM pg_constraint
            WHERE conrelid = 'chart_calculation_jobs'::regclass
              AND contype <> 't') AS constraint_count,
          interpretation_mode
        FROM chart_calculation_jobs
        WHERE id = '98000000-0000-4000-8000-000000000003'
      `);
      expect(state.rows[0]).toEqual({
        column_count: "30",
        constraint_count: "25",
        interpretation_mode: null
      });
    } finally {
      await predecessorClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${predecessorDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("rejects a current ledger when chart jobs are missing despite current prerequisites", async () => {
    const currentDatabaseName = `elevenhouse_current_chart_missing_${randomUUID().replaceAll("-", "")}`;
    const currentUrl = new URL(integrationDatabaseUrl!);
    currentUrl.pathname = `/${currentDatabaseName}`;
    let currentClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${currentDatabaseName}`);
      currentClient = new Client({ connectionString: currentUrl.toString() });
      await currentClient.connect();
      await currentClient.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
      await currentClient.query(`
        DROP TABLE chart_calculation_jobs;
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('${currentBaseline.hash}', ${currentBaseline.createdAt});
      `);

      const run = await runReconciler(currentUrl.toString());
      expect(run.exitCode).not.toBe(0);
      expect(run.output).toContain("Current chart calculation jobs catalog drifted");
    } finally {
      await currentClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${currentDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("reconciles exact legacy V1 chart jobs without fabricating reproducibility history", async () => {
    const chartDatabaseName = `elevenhouse_chart_v1_${randomUUID().replaceAll("-", "")}`;
    const chartUrl = new URL(integrationDatabaseUrl!);
    chartUrl.pathname = `/${chartDatabaseName}`;
    let chartClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${chartDatabaseName}`);
      chartClient = new Client({ connectionString: chartUrl.toString() });
      await chartClient.connect();
      await chartClient.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
      await downgradeFlowExecutionRuntime(chartClient);
      await downgradeCalculationIdentityIndexes(chartClient);
      await installLegacyChartJobsFixture(chartClient, { ambiguousActivePair: false });
      await installPreviousRuntimeLedger(chartClient);
      const succeededHistoryBefore = await readSucceededLegacyChartHistory(chartClient);

      const run = await runReconciler(chartUrl.toString());
      expect(run, run.output).toMatchObject({ exitCode: 0 });

      const jobs = await chartClient.query<{
        id: string;
        status: string;
        schema_version: string;
        result_calculation_id: string | null;
        participant_snapshot: unknown;
        interpretation_mode: string | null;
        method_version: string | null;
        execution_profile: unknown;
        result_checksum: string | null;
        result_reproducibility_fingerprint: string | null;
        last_error_code: string | null;
      }>(`
        SELECT
          id,
          status,
          schema_version,
          result_calculation_id,
          participant_snapshot,
          interpretation_mode,
          method_version,
          execution_profile,
          result_checksum,
          result_reproducibility_fingerprint,
          last_error_code
        FROM chart_calculation_jobs
        ORDER BY id
      `);
      expect(jobs.rows).toEqual([
        {
          id: "95000000-0000-4000-8000-000000000001",
          status: "failed",
          schema_version: "chart-result.v1",
          result_calculation_id: null,
          participant_snapshot: [
            { role: "subject", clientId: "92000000-0000-4000-8000-000000000001" }
          ],
          interpretation_mode: null,
          method_version: null,
          execution_profile: null,
          result_checksum: null,
          result_reproducibility_fingerprint: null,
          last_error_code: "legacy_job_requires_requeue"
        },
        {
          id: "95000000-0000-4000-8000-000000000002",
          status: "succeeded",
          schema_version: "chart-result.v1",
          result_calculation_id: "94000000-0000-4000-8000-000000000001",
          participant_snapshot: [
            { role: "subject", clientId: "92000000-0000-4000-8000-000000000001" },
            { role: "partner", clientId: "93000000-0000-4000-8000-000000000001" }
          ],
          interpretation_mode: null,
          method_version: null,
          execution_profile: null,
          result_checksum: null,
          result_reproducibility_fingerprint: null,
          last_error_code: null
        },
        {
          id: "95000000-0000-4000-8000-000000000003",
          status: "failed",
          schema_version: "chart-result.v1",
          result_calculation_id: null,
          participant_snapshot: [
            { role: "subject", clientId: "92000000-0000-4000-8000-000000000001" },
            { role: "partner", clientId: "93000000-0000-4000-8000-000000000001" }
          ],
          interpretation_mode: null,
          method_version: null,
          execution_profile: null,
          result_checksum: null,
          result_reproducibility_fingerprint: null,
          last_error_code: "legacy_job_requires_requeue"
        },
        {
          id: "95000000-0000-4000-8000-000000000004",
          status: "failed",
          schema_version: "chart-result.v1",
          result_calculation_id: null,
          participant_snapshot: [
            { role: "subject", clientId: "92000000-0000-4000-8000-000000000001" }
          ],
          interpretation_mode: null,
          method_version: null,
          execution_profile: null,
          result_checksum: null,
          result_reproducibility_fingerprint: null,
          last_error_code: "legacy_job_requires_requeue"
        }
      ]);
      const terminalized = await chartClient.query<{
        id: string;
        attempts: number;
        max_attempts: number;
        lease_generation: number;
        locks_cleared: boolean;
        administrative_zero_interval: boolean;
        original_start_preserved: boolean;
        finish_matches_update: boolean;
        last_error_message: string;
        total_job_count: string;
      }>(`
        SELECT
          id,
          attempts,
          max_attempts,
          lease_generation,
          locked_by IS NULL AND locked_until IS NULL AS locks_cleared,
          started_at = finished_at AS administrative_zero_interval,
          started_at = '2026-08-01T10:03:00.000Z'::timestamptz AS original_start_preserved,
          finished_at = updated_at AS finish_matches_update,
          last_error_message,
          (count(*) OVER ())::text AS total_job_count
        FROM chart_calculation_jobs
        WHERE status = 'failed'
        ORDER BY id
      `);
      expect(terminalized.rows).toEqual([
        {
          id: "95000000-0000-4000-8000-000000000001",
          attempts: 0,
          max_attempts: 3,
          lease_generation: 0,
          locks_cleared: true,
          administrative_zero_interval: true,
          original_start_preserved: false,
          finish_matches_update: true,
          last_error_message: "Legacy chart job requires explicit requeue under chart-result.v2",
          total_job_count: "3"
        },
        {
          id: "95000000-0000-4000-8000-000000000003",
          attempts: 1,
          max_attempts: 3,
          lease_generation: 0,
          locks_cleared: true,
          administrative_zero_interval: false,
          original_start_preserved: true,
          finish_matches_update: true,
          last_error_message: "Legacy chart job requires explicit requeue under chart-result.v2",
          total_job_count: "3"
        },
        {
          id: "95000000-0000-4000-8000-000000000004",
          attempts: 1,
          max_attempts: 3,
          lease_generation: 0,
          locks_cleared: true,
          administrative_zero_interval: false,
          original_start_preserved: false,
          finish_matches_update: true,
          last_error_message: "Legacy chart job requires explicit requeue under chart-result.v2",
          total_job_count: "3"
        }
      ]);
      expect(JSON.stringify(terminalized.rows)).not.toContain("anton.private@example.com");
      expect(JSON.stringify(terminalized.rows)).not.toContain("SELECT * FROM client_profiles");
      const jobCount = await chartClient.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM chart_calculation_jobs"
      );
      expect(jobCount.rows[0]?.count).toBe("4");
      await expect(readSucceededLegacyChartHistory(chartClient)).resolves.toEqual(
        succeededHistoryBefore
      );

      const catalog = await chartClient.query<{
        column_count: string;
        constraint_count: string;
        index_count: string;
        schema_default: string | null;
        success_index: string | null;
        request_index_definition: string;
        participant_role_unique: string | null;
        legacy_participant_role_index: string | null;
        current_baseline_count: string;
      }>(`
        SELECT
          (SELECT count(*)::text
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'chart_calculation_jobs') AS column_count,
          (SELECT count(*)::text
             FROM pg_constraint
            WHERE conrelid = 'chart_calculation_jobs'::regclass
              AND contype <> 't') AS constraint_count,
          (SELECT count(*)::text
             FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'chart_calculation_jobs') AS index_count,
          (SELECT column_default
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'chart_calculation_jobs'
              AND column_name = 'schema_version') AS schema_default,
          to_regclass('public.chart_calculation_jobs_success_fingerprint_unique')::text
            AS success_index,
          (SELECT indexdef
             FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = 'calculation_records_exact_request_unique')
            AS request_index_definition,
          (SELECT pg_get_constraintdef(oid, false)
             FROM pg_constraint
            WHERE conrelid = 'calculation_participants'::regclass
              AND conname = 'calculation_participants_record_role_unique')
            AS participant_role_unique,
          to_regclass('public.calculation_participants_record_role_idx')::text
            AS legacy_participant_role_index,
          (SELECT count(*)::text
             FROM drizzle.__drizzle_migrations
            WHERE hash = '${currentBaseline.hash}'
              AND created_at = ${currentBaseline.createdAt}) AS current_baseline_count
      `);
      expect(catalog.rows[0]).toEqual({
        column_count: "30",
        constraint_count: "25",
        index_count: "5",
        schema_default: "'chart-result.v2'::text",
        success_index: null,
        request_index_definition:
          "CREATE UNIQUE INDEX calculation_records_exact_request_unique ON public.calculation_records USING btree (owner_user_id, module, mode, method_code, request_fingerprint) WHERE (status <> 'archived'::text)",
        participant_role_unique: "UNIQUE (calculation_id, role)",
        legacy_participant_role_index: null,
        current_baseline_count: "1"
      });

      const rerunEvidenceBefore = await readChartReconciliationEvidence(chartClient);
      const secondRun = await runReconciler(chartUrl.toString());
      expect(secondRun, secondRun.output).toMatchObject({ exitCode: 0 });
      expect(secondRun.output).toContain("Current production baseline is already recorded");
      await expect(readChartReconciliationEvidence(chartClient)).resolves.toEqual(
        rerunEvidenceBefore
      );
    } finally {
      await chartClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${chartDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("rolls back chart reconciliation when a legacy relationship identity is ambiguous", async () => {
    const chartDatabaseName = `elevenhouse_chart_ambiguous_${randomUUID().replaceAll("-", "")}`;
    const chartUrl = new URL(integrationDatabaseUrl!);
    chartUrl.pathname = `/${chartDatabaseName}`;
    let chartClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${chartDatabaseName}`);
      chartClient = new Client({ connectionString: chartUrl.toString() });
      await chartClient.connect();
      await chartClient.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
      await downgradeFlowExecutionRuntime(chartClient);
      await downgradeCalculationIdentityIndexes(chartClient);
      await installLegacyChartJobsFixture(chartClient, { ambiguousActivePair: true });
      await installPreviousRuntimeLedger(chartClient);

      const run = await runReconciler(chartUrl.toString());
      expect(run.exitCode).not.toBe(0);
      expect(run.output).toContain("Cannot prove legacy chart job participants");

      const state = await chartClient.query<{
        column_count: string;
        current_baseline_count: string;
        active_status: string;
        success_index: string | null;
        request_index_definition: string;
        participant_role_unique: string | null;
        legacy_participant_role_index: string | null;
      }>(`
        SELECT
          (SELECT count(*)::text
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'chart_calculation_jobs') AS column_count,
          (SELECT count(*)::text
             FROM drizzle.__drizzle_migrations
            WHERE hash = '${currentBaseline.hash}'
              AND created_at = ${currentBaseline.createdAt}) AS current_baseline_count,
          (SELECT status
             FROM chart_calculation_jobs
            WHERE id = '95000000-0000-4000-8000-000000000003') AS active_status,
          to_regclass('public.chart_calculation_jobs_success_fingerprint_unique')::text
            AS success_index,
          (SELECT indexdef
             FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = 'calculation_records_exact_request_unique')
            AS request_index_definition,
          (SELECT pg_get_constraintdef(oid, false)
             FROM pg_constraint
            WHERE conrelid = 'calculation_participants'::regclass
              AND conname = 'calculation_participants_record_role_unique')
            AS participant_role_unique,
          to_regclass('public.calculation_participants_record_role_idx')::text
            AS legacy_participant_role_index
      `);
      expect(state.rows[0]).toEqual({
        column_count: "21",
        current_baseline_count: "0",
        active_status: "processing",
        success_index: "chart_calculation_jobs_success_fingerprint_unique",
        request_index_definition:
          "CREATE UNIQUE INDEX calculation_records_exact_request_unique ON public.calculation_records USING btree (owner_user_id, module, mode, method_code, request_fingerprint)",
        participant_role_unique: null,
        legacy_participant_role_index: "calculation_participants_record_role_idx"
      });
    } finally {
      await chartClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${chartDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("rolls back when succeeded V1 input and result relationship identities disagree", async () => {
    const chartDatabaseName = `elevenhouse_chart_result_mismatch_${randomUUID().replaceAll("-", "")}`;
    const chartUrl = new URL(integrationDatabaseUrl!);
    chartUrl.pathname = `/${chartDatabaseName}`;
    let chartClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${chartDatabaseName}`);
      chartClient = new Client({ connectionString: chartUrl.toString() });
      await chartClient.connect();
      await chartClient.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
      await downgradeFlowExecutionRuntime(chartClient);
      await downgradeCalculationIdentityIndexes(chartClient);
      await installLegacyChartJobsFixture(chartClient, {
        ambiguousActivePair: false,
        mismatchedSucceededRelationship: true
      });
      await installPreviousRuntimeLedger(chartClient);
      const historyBefore = await readSucceededLegacyChartHistory(chartClient);

      const run = await runReconciler(chartUrl.toString());
      expect(run.exitCode).not.toBe(0);
      expect(run.output).toContain("Cannot prove succeeded legacy chart relationship identity");

      const state = await chartClient.query<{
        column_count: string;
        current_baseline_count: string;
        calculation_mode: string;
        participant_count: string;
      }>(`
        SELECT
          (SELECT count(*)::text
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'chart_calculation_jobs') AS column_count,
          (SELECT count(*)::text
             FROM drizzle.__drizzle_migrations
            WHERE hash = '${currentBaseline.hash}'
              AND created_at = ${currentBaseline.createdAt}) AS current_baseline_count,
          (SELECT mode
             FROM calculation_records
            WHERE id = '94000000-0000-4000-8000-000000000001') AS calculation_mode,
          (SELECT count(*)::text
             FROM calculation_participants
            WHERE calculation_id = '94000000-0000-4000-8000-000000000001')
            AS participant_count
      `);
      expect(state.rows[0]).toEqual({
        column_count: "21",
        current_baseline_count: "0",
        calculation_mode: "individual",
        participant_count: "1"
      });
      await expect(readSucceededLegacyChartHistory(chartClient)).resolves.toEqual(historyBefore);
    } finally {
      await chartClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${chartDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("rolls back before chart DDL when predecessor participant identity is duplicated", async () => {
    const chartDatabaseName = `elevenhouse_chart_duplicate_participant_${randomUUID().replaceAll("-", "")}`;
    const chartUrl = new URL(integrationDatabaseUrl!);
    chartUrl.pathname = `/${chartDatabaseName}`;
    let chartClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${chartDatabaseName}`);
      chartClient = new Client({ connectionString: chartUrl.toString() });
      await chartClient.connect();
      await chartClient.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
      await downgradeFlowExecutionRuntime(chartClient);
      await downgradeCalculationIdentityIndexes(chartClient);
      await installLegacyChartJobsFixture(chartClient, {
        ambiguousActivePair: false,
        duplicateParticipantIdentity: true
      });
      await installPreviousRuntimeLedger(chartClient);

      const run = await runReconciler(chartUrl.toString());
      expect(run.exitCode).not.toBe(0);
      expect(run.output).toContain("Cannot prove calculation participant identity uniqueness");

      const state = await chartClient.query<{
        column_count: string;
        current_baseline_count: string;
        participant_role_unique: string | null;
        legacy_participant_role_index: string | null;
      }>(`
        SELECT
          (SELECT count(*)::text
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'chart_calculation_jobs') AS column_count,
          (SELECT count(*)::text
             FROM drizzle.__drizzle_migrations
            WHERE hash = '${currentBaseline.hash}'
              AND created_at = ${currentBaseline.createdAt}) AS current_baseline_count,
          (SELECT pg_get_constraintdef(oid, false)
             FROM pg_constraint
            WHERE conrelid = 'calculation_participants'::regclass
              AND conname = 'calculation_participants_record_role_unique')
            AS participant_role_unique,
          to_regclass('public.calculation_participants_record_role_idx')::text
            AS legacy_participant_role_index
      `);
      expect(state.rows[0]).toEqual({
        column_count: "21",
        current_baseline_count: "0",
        participant_role_unique: null,
        legacy_participant_role_index: "calculation_participants_record_role_idx"
      });
    } finally {
      await chartClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${chartDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("rolls back runtime DDL and ledger recording when the transition fails", async () => {
    const rollbackDatabaseName = `elevenhouse_runtime_rollback_${randomUUID().replaceAll("-", "")}`;
    const rollbackUrl = new URL(integrationDatabaseUrl!);
    rollbackUrl.pathname = `/${rollbackDatabaseName}`;
    let rollbackClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${rollbackDatabaseName}`);
      rollbackClient = new Client({ connectionString: rollbackUrl.toString() });
      await rollbackClient.connect();
      await rollbackClient.query(
        readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8")
      );
      await rollbackClient.query(`
        DROP TABLE chart_calculation_jobs;
        DROP FUNCTION elevenhouse_guard_chart_job_result_checksum_mutation();
      `);
      await downgradeFlowExecutionRuntime(rollbackClient);
      await rollbackClient.query(`
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('${previousRuntimeKernelBaseline.hash}', ${previousRuntimeKernelBaseline.createdAt});

        CREATE FUNCTION elevenhouse_test_fail_current_baseline_insert()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $test_failure$
        BEGIN
          IF NEW.hash = '${currentBaseline.hash}' THEN
            RAISE EXCEPTION 'forced current baseline ledger failure';
          END IF;
          RETURN NEW;
        END;
        $test_failure$;
        CREATE TRIGGER elevenhouse_test_fail_current_baseline_insert
        BEFORE INSERT ON drizzle.__drizzle_migrations
        FOR EACH ROW
        EXECUTE FUNCTION elevenhouse_test_fail_current_baseline_insert();
      `);

      const run = await runReconciler(rollbackUrl.toString());
      expect(run.exitCode).not.toBe(0);
      expect(run.output).toContain("forced current baseline ledger failure");

      const state = await rollbackClient.query<{
        token_table: string | null;
        trace_sequence_count: string;
        previous_baseline_count: string;
        current_baseline_count: string;
      }>(`
        SELECT
          to_regclass('public.flow_execution_tokens')::text AS token_table,
          (SELECT count(*)::text
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'flow_runs'
              AND column_name = 'trace_sequence') AS trace_sequence_count,
          (SELECT count(*)::text
             FROM drizzle.__drizzle_migrations
            WHERE hash = '${previousRuntimeKernelBaseline.hash}'
              AND created_at = ${previousRuntimeKernelBaseline.createdAt}) AS previous_baseline_count,
          (SELECT count(*)::text
             FROM drizzle.__drizzle_migrations
            WHERE hash = '${currentBaseline.hash}'
              AND created_at = ${currentBaseline.createdAt}) AS current_baseline_count
      `);
      expect(state.rows[0]).toEqual({
        token_table: null,
        trace_sequence_count: "0",
        previous_baseline_count: "1",
        current_baseline_count: "0"
      });
    } finally {
      await rollbackClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${rollbackDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("serializes concurrent runtime reconciliation and records current exactly once", async () => {
    const concurrentDatabaseName = `elevenhouse_runtime_concurrent_${randomUUID().replaceAll("-", "")}`;
    const concurrentUrl = new URL(integrationDatabaseUrl!);
    concurrentUrl.pathname = `/${concurrentDatabaseName}`;
    let concurrentClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${concurrentDatabaseName}`);
      concurrentClient = new Client({ connectionString: concurrentUrl.toString() });
      await concurrentClient.connect();
      await concurrentClient.query(
        readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8")
      );
      await concurrentClient.query(`
        DROP TABLE chart_calculation_jobs;
        DROP FUNCTION elevenhouse_guard_chart_job_result_checksum_mutation();
      `);
      await downgradeFlowExecutionRuntime(concurrentClient);
      await concurrentClient.query(`
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('${previousRuntimeKernelBaseline.hash}', ${previousRuntimeKernelBaseline.createdAt});
      `);

      const runs = await Promise.all([
        runReconciler(concurrentUrl.toString()),
        runReconciler(concurrentUrl.toString())
      ]);
      expect(runs.map((run) => run.exitCode)).toEqual([0, 0]);
      expect(
        runs.some((run) => run.output.includes("Previous Flows runtime baseline reconciled"))
      ).toBe(true);
      expect(
        runs.some((run) => run.output.includes("Current production baseline is already recorded"))
      ).toBe(true);

      const state = await concurrentClient.query<{
        current_baseline_count: string;
        token_table: string | null;
        enabled_history_trigger_count: string;
      }>(`
        SELECT
          (SELECT count(*)::text
             FROM drizzle.__drizzle_migrations
            WHERE hash = '${currentBaseline.hash}'
              AND created_at = ${currentBaseline.createdAt}) AS current_baseline_count,
          to_regclass('public.flow_execution_tokens')::text AS token_table,
          (SELECT count(*)::text
             FROM pg_trigger
            WHERE NOT tgisinternal
              AND tgenabled = 'O'
              AND tgname IN (
                'flow_execution_attempts_immutable',
                'flow_execution_attempts_truncate_guard',
                'flow_run_events_immutable',
                'flow_run_events_truncate_guard'
              )) AS enabled_history_trigger_count
      `);
      expect(state.rows[0]).toEqual({
        current_baseline_count: "1",
        token_table: "flow_execution_tokens",
        enabled_history_trigger_count: "4"
      });
    } finally {
      await concurrentClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${concurrentDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("adds the definition-state read index to the exact prior Flows control baseline", async () => {
    const priorDatabaseName = `elevenhouse_previous_flows_${randomUUID().replaceAll("-", "")}`;
    const priorUrl = new URL(integrationDatabaseUrl!);
    priorUrl.pathname = `/${priorDatabaseName}`;
    let priorClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${priorDatabaseName}`);
      priorClient = new Client({ connectionString: priorUrl.toString() });
      await priorClient.connect();
      await priorClient.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
      await priorClient.query(`
        DROP TABLE chart_calculation_jobs;
        DROP FUNCTION elevenhouse_guard_chart_job_result_checksum_mutation();
      `);
      await downgradeFlowExecutionRuntime(priorClient);
      await priorClient.query("DROP INDEX flows_owner_definition_state_updated_idx");
      await priorClient.query(`
        CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (
          '${previousFlowDefinitionControlBaseline.hash}',
          ${previousFlowDefinitionControlBaseline.createdAt}
        );
      `);

      const run = await runReconciler(priorUrl.toString());
      expect(run, run.output).toMatchObject({ exitCode: 0 });
      expect(run.output).toContain("Previous Flows control baseline reconciled");

      const state = await priorClient.query<{
        current_baseline_count: string;
        previous_baseline_count: string;
        definition_state_index_count: string;
      }>(`
        SELECT
          (SELECT count(*)::text FROM drizzle.__drizzle_migrations
            WHERE hash = '${currentBaseline.hash}'
              AND created_at = ${currentBaseline.createdAt}) AS current_baseline_count,
          (SELECT count(*)::text FROM drizzle.__drizzle_migrations
            WHERE hash = '${previousFlowDefinitionControlBaseline.hash}'
              AND created_at = ${previousFlowDefinitionControlBaseline.createdAt}) AS previous_baseline_count,
          (SELECT count(*)::text FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'flows'
              AND indexname = 'flows_owner_definition_state_updated_idx') AS definition_state_index_count
      `);
      expect(state.rows[0]).toEqual({
        current_baseline_count: "1",
        previous_baseline_count: "1",
        definition_state_index_count: "1"
      });

      const secondRun = await runReconciler(priorUrl.toString());
      expect(secondRun.exitCode).toBe(0);
      expect(secondRun.output).toContain("Current production baseline is already recorded");
    } finally {
      await priorClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${priorDatabaseName} WITH (FORCE)`);
    }
  }, 60_000);

  it("rejects a predecessor with a misleading same-name publication constraint", async () => {
    const databaseName = `elevenhouse_wrong_flows_${randomUUID().replaceAll("-", "")}`;
    const databaseUrl = new URL(integrationDatabaseUrl!);
    databaseUrl.pathname = `/${databaseName}`;
    let databaseClient: Client | undefined;

    try {
      await adminClient.query(`CREATE DATABASE ${databaseName}`);
      databaseClient = new Client({ connectionString: databaseUrl.toString() });
      await databaseClient.connect();
      await databaseClient.query(previousProductionFixtureSql());
      await databaseClient.query(`
        ALTER TABLE flows DROP CONSTRAINT flows_published_version_owner_fk;
        ALTER TABLE flows
          ADD CONSTRAINT flows_published_version_owner_fk
          FOREIGN KEY (id, published_version_id, owner_user_id)
          REFERENCES flow_versions(flow_id, id, owner_user_id) ON DELETE CASCADE;
      `);

      const run = await runReconciler(databaseUrl.toString());
      expect(run.exitCode).not.toBe(0);

      const ledger = await databaseClient.query<{ current_baseline_count: string }>(`
        SELECT count(*)::text AS current_baseline_count
          FROM drizzle.__drizzle_migrations
         WHERE hash = '${currentBaseline.hash}'
           AND created_at = ${currentBaseline.createdAt}
      `);
      expect(ledger.rows[0]?.current_baseline_count).toBe("0");
    } finally {
      await databaseClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    }
  }, 30_000);

  it("refuses an unknown migration history even when the current baseline hash is present", async () => {
    await databaseClient.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      ["f".repeat(64), "1784111509390"]
    );

    const run = await runReconciler(databaseUrl);

    expect(run.exitCode).not.toBe(0);
    expect(run.output).toContain("Refusing to reconcile an unknown migration history");
  });
});

async function runReconciler(databaseUrl: string): Promise<{
  readonly exitCode: number;
  readonly output: string;
}> {
  try {
    const result = await execFileAsync(
      "pnpm",
      ["--filter", "@elevenhouse/db", "db:reconcile-production-baseline"],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        timeout: 20_000
      }
    );
    return { exitCode: 0, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`
    };
  }
}

async function runMigrator(databaseUrl: string): Promise<{
  readonly exitCode: number;
  readonly output: string;
}> {
  try {
    const result = await execFileAsync("pnpm", ["--filter", "@elevenhouse/db", "db:migrate"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      timeout: 20_000
    });
    return { exitCode: 0, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`
    };
  }
}

async function installCompletedFlowExecutionFixture(databaseClient: Client): Promise<void> {
  await databaseClient.query(`
    BEGIN;
    INSERT INTO users (id) VALUES ('8a000000-0000-4000-8000-000000000001');
    INSERT INTO flows (
      id, owner_user_id, name, status, definition_state, approval_mode, revision,
      draft_graph, created_at, updated_at
    ) VALUES (
      '8b000000-0000-4000-8000-000000000001',
      '8a000000-0000-4000-8000-000000000001',
      'Preserved completed execution',
      'draft',
      'draft',
      'manual_approve',
      1,
      '${validLegacyFlowGraphJson}',
      '2026-08-03T10:00:00.000Z',
      '2026-08-03T10:00:00.000Z'
    );
    INSERT INTO flow_versions (
      id, flow_id, owner_user_id, version, approval_mode, graph, published_at
    ) VALUES (
      '8c000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      '8a000000-0000-4000-8000-000000000001',
      1,
      'manual_approve',
      '${validLegacyFlowGraphJson}',
      '2026-08-03T10:01:00.000Z'
    );
    UPDATE flows
       SET status = 'active',
           definition_state = 'versioned',
           published_version_id = '8c000000-0000-4000-8000-000000000001',
           published_at = '2026-08-03T10:01:00.000Z'
     WHERE id = '8b000000-0000-4000-8000-000000000001';
    INSERT INTO flow_runtime_events (
      id, owner_user_id, source, source_event_id, dedupe_key, subject_type, subject_id,
      occurred_at, payload, created_at
    ) VALUES (
      '8d000000-0000-4000-8000-000000000001',
      '8a000000-0000-4000-8000-000000000001',
      'manual',
      'preserved-completed-execution',
      'preserved-completed-execution',
      'manual',
      'preserved-completed-subject',
      '2026-08-03T10:02:00.000Z',
      '{}',
      '2026-08-03T10:02:00.000Z'
    );
    INSERT INTO flow_runs (
      id, owner_user_id, flow_id, flow_version_id, runtime_event_id, status, snapshot,
      current_node_id, trace_sequence, created_at, updated_at, completed_at
    ) VALUES (
      '8e000000-0000-4000-8000-000000000001',
      '8a000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      '8c000000-0000-4000-8000-000000000001',
      '8d000000-0000-4000-8000-000000000001',
      'completed',
      '{}',
      'completed-node',
      1,
      '2026-08-03T10:02:00.000Z',
      '2026-08-03T10:04:00.000Z',
      '2026-08-03T10:04:00.000Z'
    );
    INSERT INTO flow_execution_tokens (
      id, owner_user_id, flow_run_id, flow_version_id, node_id, node_kind,
      config_schema_version, executor_contract_version, executor_key, state, available_at,
      node_activation_sequence, attempt_counter, fencing_token, terminal_at, created_at, updated_at
    ) VALUES (
      '8f000000-0000-4000-8000-000000000001',
      '8a000000-0000-4000-8000-000000000001',
      '8e000000-0000-4000-8000-000000000001',
      '8c000000-0000-4000-8000-000000000001',
      'completed-node',
      'completed',
      1,
      1,
      'completed:1:1',
      'completed',
      '2026-08-03T10:02:00.000Z',
      1,
      1,
      1,
      '2026-08-03T10:04:00.000Z',
      '2026-08-03T10:02:00.000Z',
      '2026-08-03T10:04:00.000Z'
    );
    INSERT INTO flow_execution_attempts (
      id, owner_user_id, flow_run_id, token_id, flow_version_id, node_id, executor_key,
      node_activation_sequence, attempt_number, fencing_token, lease_owner, outcome, result_code, trace_summary,
      started_at, completed_at, created_at
    ) VALUES (
      '8a000000-0000-4000-8000-000000000002',
      '8a000000-0000-4000-8000-000000000001',
      '8e000000-0000-4000-8000-000000000001',
      '8f000000-0000-4000-8000-000000000001',
      '8c000000-0000-4000-8000-000000000001',
      'completed-node',
      'completed:1:1',
      1,
      1,
      1,
      'worker:preserved-fixture',
      'completed',
      'FLOW_RUN_COMPLETED',
      '{
        "schemaVersion":"flow-runtime-trace.v1",
        "outcome":"terminal",
        "nodeKind":"completed",
        "reasonCode":"FLOW_GOAL_REACHED",
        "resultCode":"FLOW_RUN_COMPLETED"
      }',
      '2026-08-03T10:03:00.000Z',
      '2026-08-03T10:04:00.000Z',
      '2026-08-03T10:04:00.000Z'
    );
    INSERT INTO flow_run_events (
      id, owner_user_id, flow_run_id, sequence, event_type, node_id, attempt_id, summary,
      occurred_at
    ) VALUES (
      '8b000000-0000-4000-8000-000000000002',
      '8a000000-0000-4000-8000-000000000001',
      '8e000000-0000-4000-8000-000000000001',
      1,
      'run_completed',
      'completed-node',
      '8a000000-0000-4000-8000-000000000002',
      '{
        "schemaVersion":"flow-runtime-trace.v1",
        "outcome":"terminal",
        "nodeKind":"completed",
        "reasonCode":"FLOW_GOAL_REACHED",
        "resultCode":"FLOW_RUN_COMPLETED"
      }',
      '2026-08-03T10:04:00.000Z'
    );
    COMMIT;
  `);
}

async function installPreviousCancellationKernelLedger(databaseClient: Client): Promise<void> {
  await databaseClient.query(`
    CREATE SCHEMA drizzle;
    CREATE TABLE drizzle.__drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (
      '${previousCancellationKernelBaseline.hash}',
      ${previousCancellationKernelBaseline.createdAt}
    );
  `);
}

async function readFlowExecutionEvidence(databaseClient: Client): Promise<unknown> {
  const result = await databaseClient.query<{ evidence: unknown }>(`
    SELECT jsonb_build_object(
      'runs',
      coalesce((
        SELECT jsonb_agg(
          to_jsonb(run_row) || jsonb_build_object(
            '__xmin', run_row.xmin::text,
            '__ctid', run_row.ctid::text
          )
          ORDER BY run_row.id
        )
          FROM flow_runs AS run_row
         WHERE run_row.owner_user_id = '8a000000-0000-4000-8000-000000000001'
      ), '[]'::jsonb),
      'tokens',
      coalesce((
        SELECT jsonb_agg(
          (to_jsonb(token_row) - ARRAY[
            'retry_policy_key', 'max_attempts', 'retry_base_delay_ms',
            'retry_max_delay_ms', 'failure_disposition', 'failure_reason_code',
            'quarantined_at', 'node_activation_sequence'
          ]::text[]) || jsonb_build_object(
            '__xmin', token_row.xmin::text,
            '__ctid', token_row.ctid::text
          )
          ORDER BY token_row.id
        )
          FROM flow_execution_tokens AS token_row
         WHERE token_row.owner_user_id = '8a000000-0000-4000-8000-000000000001'
      ), '[]'::jsonb),
      'attempts',
      coalesce((
        SELECT jsonb_agg(
          (to_jsonb(attempt_row) - 'node_activation_sequence')
            || jsonb_build_object(
              '__xmin', attempt_row.xmin::text,
              '__ctid', attempt_row.ctid::text
            )
          ORDER BY attempt_row.id
        )
          FROM flow_execution_attempts AS attempt_row
         WHERE attempt_row.owner_user_id = '8a000000-0000-4000-8000-000000000001'
      ), '[]'::jsonb),
      'events',
      coalesce((
        SELECT jsonb_agg(
          (to_jsonb(event_row) - 'command_id')
            || jsonb_build_object(
              '__xmin', event_row.xmin::text,
              '__ctid', event_row.ctid::text
            )
          ORDER BY event_row.id
        )
          FROM flow_run_events AS event_row
         WHERE event_row.owner_user_id = '8a000000-0000-4000-8000-000000000001'
      ), '[]'::jsonb)
    ) AS evidence
  `);
  const evidence = result.rows[0]?.evidence;
  if (evidence === undefined) throw new Error("Expected Flows execution evidence");
  return evidence;
}

async function readFlowActivationEvidence(databaseClient: Client): Promise<{
  readonly attempts: readonly string[];
  readonly tokens: readonly string[];
}> {
  const [tokens, attempts] = await Promise.all([
    databaseClient.query<{ sequence: string }>(`
      SELECT node_activation_sequence::text AS sequence
        FROM flow_execution_tokens
       ORDER BY id
    `),
    databaseClient.query<{ sequence: string }>(`
      SELECT node_activation_sequence::text AS sequence
        FROM flow_execution_attempts
       ORDER BY id
    `)
  ]);
  return {
    attempts: attempts.rows.map((row) => row.sequence),
    tokens: tokens.rows.map((row) => row.sequence)
  };
}

async function downgradeFlowExecutionRuntime(databaseClient: Client): Promise<void> {
  await downgradeFlowRunCancellation(databaseClient);
  await databaseClient.query(`
    DROP TABLE flow_run_events;
    DROP TABLE flow_execution_attempts;
    DROP TABLE flow_execution_tokens;
    DROP FUNCTION elevenhouse_guard_flow_execution_history_mutation();
    ALTER TABLE flow_runs
      DROP CONSTRAINT flow_runs_trace_sequence_check,
      DROP CONSTRAINT flow_runs_id_version_owner_unique,
      DROP COLUMN trace_sequence;
  `);
}

async function downgradeFlowSafety(databaseClient: Client): Promise<void> {
  await databaseClient.query(`
    DROP INDEX flow_run_events_attempt_unique;
    DROP INDEX flow_execution_attempts_token_activation_attempt_unique;
    CREATE UNIQUE INDEX flow_execution_attempts_token_attempt_unique
      ON flow_execution_attempts (token_id, attempt_number);

    DROP INDEX flow_execution_tokens_quarantined_idx;

    ALTER TABLE flow_execution_tokens
      DROP CONSTRAINT flow_execution_tokens_attempt_counter_check,
      DROP CONSTRAINT flow_execution_tokens_fencing_token_check,
      DROP CONSTRAINT flow_execution_tokens_lease_state_check,
      DROP CONSTRAINT flow_execution_tokens_counter_state_check,
      ADD CONSTRAINT flow_execution_tokens_attempt_counter_check CHECK (attempt_counter >= 0),
      ADD CONSTRAINT flow_execution_tokens_fencing_token_check CHECK (fencing_token >= 0),
      ADD CONSTRAINT flow_execution_tokens_lease_state_check CHECK (
        (
          state = 'claimed'
          AND claimed_at IS NOT NULL
          AND lease_owner IS NOT NULL
          AND lease_expires_at IS NOT NULL
        ) OR (
          state <> 'claimed'
          AND claimed_at IS NULL
          AND lease_owner IS NULL
          AND lease_expires_at IS NULL
        )
      );

    ALTER TABLE flow_execution_tokens
      DROP CONSTRAINT flow_execution_tokens_node_activation_sequence_check,
      DROP CONSTRAINT flow_execution_tokens_node_kind_check,
      DROP CONSTRAINT flow_execution_tokens_retry_policy_check,
      DROP CONSTRAINT flow_execution_tokens_failure_disposition_check,
      DROP CONSTRAINT flow_execution_tokens_failure_reason_check,
      DROP CONSTRAINT flow_execution_tokens_failure_state_check,
      DROP COLUMN retry_policy_key,
      DROP COLUMN max_attempts,
      DROP COLUMN retry_base_delay_ms,
      DROP COLUMN retry_max_delay_ms,
      DROP COLUMN failure_disposition,
      DROP COLUMN failure_reason_code,
      DROP COLUMN quarantined_at,
      DROP COLUMN node_activation_sequence;

    ALTER TABLE flow_execution_attempts
      DROP CONSTRAINT flow_execution_attempts_node_activation_sequence_check,
      DROP CONSTRAINT flow_execution_attempts_number_check,
      DROP CONSTRAINT flow_execution_attempts_trace_summary_schema_check,
      ADD CONSTRAINT flow_execution_attempts_number_check CHECK (
        attempt_number > 0 AND fencing_token > 0
      ),
      ADD CONSTRAINT flow_execution_attempts_trace_summary_schema_check CHECK (
        trace_summary ?& ARRAY[
          'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
        ]::text[]
        AND trace_summary - ARRAY[
          'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
        ]::text[] = '{}'::jsonb
        AND jsonb_typeof(trace_summary->'schemaVersion') = 'string'
        AND jsonb_typeof(trace_summary->'outcome') = 'string'
        AND jsonb_typeof(trace_summary->'nodeKind') = 'string'
        AND jsonb_typeof(trace_summary->'reasonCode') = 'string'
        AND jsonb_typeof(trace_summary->'resultCode') = 'string'
        AND trace_summary->>'schemaVersion' = 'flow-runtime-trace.v1'
        AND trace_summary->>'nodeKind' IN (
          'booking_confirmed', 'manual_client', 'birth_data_available', 'astrologer_work_item',
          'astrologer_approval', 'completed', 'suppressed', 'failed'
        )
        AND trace_summary->>'nodeKind' = split_part(executor_key, ':', 1)
        AND result_code = trace_summary->>'resultCode'
        AND length(trace_summary->>'resultCode') BETWEEN 1 AND 160
        AND trace_summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        AND (
          (
            outcome = 'completed'
            AND trace_summary->>'outcome' = 'terminal'
            AND trace_summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
          ) OR (
            outcome = 'lease_expired'
            AND trace_summary->>'outcome' = 'lease_expired'
            AND trace_summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
            AND trace_summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          ) OR (
            outcome = 'canceled'
            AND trace_summary->>'outcome' = 'canceled'
            AND trace_summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
            AND trace_summary->>'resultCode' = 'FLOW_RUN_CANCELED'
          )
        )
      ),
      DROP COLUMN node_activation_sequence;

    ALTER TABLE flow_run_events
      DROP CONSTRAINT flow_run_events_summary_schema_check,
      ADD CONSTRAINT flow_run_events_summary_schema_check CHECK (
        summary ?& ARRAY[
          'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
        ]::text[]
        AND summary - ARRAY[
          'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
        ]::text[] = '{}'::jsonb
        AND jsonb_typeof(summary->'schemaVersion') = 'string'
        AND jsonb_typeof(summary->'outcome') = 'string'
        AND jsonb_typeof(summary->'nodeKind') = 'string'
        AND jsonb_typeof(summary->'reasonCode') = 'string'
        AND jsonb_typeof(summary->'resultCode') = 'string'
        AND summary->>'schemaVersion' = 'flow-runtime-trace.v1'
        AND summary->>'nodeKind' IN (
          'booking_confirmed', 'manual_client', 'birth_data_available', 'astrologer_work_item',
          'astrologer_approval', 'completed', 'suppressed', 'failed'
        )
        AND length(summary->>'resultCode') BETWEEN 1 AND 160
        AND summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        AND (
          (
            event_type = 'run_completed'
            AND attempt_id IS NOT NULL
            AND command_id IS NULL
            AND summary->>'outcome' = 'terminal'
            AND summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
          ) OR (
            event_type = 'token_lease_expired'
            AND attempt_id IS NOT NULL
            AND command_id IS NULL
            AND summary->>'outcome' = 'lease_expired'
            AND summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
            AND summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          ) OR (
            event_type = 'run_canceled'
            AND command_id IS NOT NULL
            AND summary->>'outcome' = 'canceled'
            AND summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
            AND summary->>'resultCode' = 'FLOW_RUN_CANCELED'
          )
        )
      );

    DROP INDEX outbox_events_quarantined_index;
    ALTER TABLE outbox_events
      DROP CONSTRAINT outbox_events_status_check,
      DROP CONSTRAINT outbox_events_claim_fence_check,
      DROP CONSTRAINT outbox_events_quarantine_reason_code_check,
      DROP CONSTRAINT outbox_events_state_check,
      ADD CONSTRAINT outbox_events_status_check
        CHECK (status IN ('pending', 'publishing', 'published')),
      ADD CONSTRAINT outbox_events_pending_not_published_check
        CHECK (status <> 'pending' OR published_at IS NULL),
      ADD CONSTRAINT outbox_events_publishing_locked_check
        CHECK (status <> 'publishing' OR locked_at IS NOT NULL),
      ADD CONSTRAINT outbox_events_published_at_check
        CHECK (status <> 'published' OR published_at IS NOT NULL),
      DROP COLUMN claim_fence,
      DROP COLUMN quarantined_at,
      DROP COLUMN quarantine_reason_code;
  `);
}

async function downgradeFlowAtomicAdvance(databaseClient: Client): Promise<void> {
  await downgradeFlowSafety(databaseClient);
  await databaseClient.query(flowExecutionRetrySafetyBaselineDdl);
  await databaseClient.query(flowOutboxSafetyBaselineDdl);
}

async function downgradeFlowRunCancellation(databaseClient: Client): Promise<void> {
  await downgradeFlowSafety(databaseClient);
  await databaseClient.query(`
    ALTER TABLE flow_execution_attempts
      DROP CONSTRAINT flow_execution_attempts_trace_summary_schema_check,
      ADD CONSTRAINT flow_execution_attempts_trace_summary_schema_check CHECK (
        trace_summary ?& ARRAY[
          'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
        ]::text[]
        AND trace_summary - ARRAY[
          'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
        ]::text[] = '{}'::jsonb
        AND jsonb_typeof(trace_summary->'schemaVersion') = 'string'
        AND jsonb_typeof(trace_summary->'outcome') = 'string'
        AND jsonb_typeof(trace_summary->'nodeKind') = 'string'
        AND jsonb_typeof(trace_summary->'reasonCode') = 'string'
        AND jsonb_typeof(trace_summary->'resultCode') = 'string'
        AND trace_summary->>'schemaVersion' = 'flow-runtime-trace.v1'
        AND trace_summary->>'nodeKind' IN (
          'booking_confirmed', 'manual_client', 'birth_data_available', 'astrologer_work_item',
          'astrologer_approval', 'completed', 'suppressed', 'failed'
        )
        AND trace_summary->>'nodeKind' = split_part(executor_key, ':', 1)
        AND result_code = trace_summary->>'resultCode'
        AND length(trace_summary->>'resultCode') BETWEEN 1 AND 160
        AND trace_summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        AND (
          (
            outcome = 'completed'
            AND trace_summary->>'outcome' = 'terminal'
            AND trace_summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
          )
          OR (
            outcome = 'lease_expired'
            AND trace_summary->>'outcome' = 'lease_expired'
            AND trace_summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
            AND trace_summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          )
        )
      );

    ALTER TABLE flow_run_events
      DROP CONSTRAINT flow_run_events_summary_schema_check,
      DROP CONSTRAINT flow_run_events_command_run_owner_fk,
      DROP COLUMN command_id,
      ADD CONSTRAINT flow_run_events_summary_schema_check CHECK (
        summary ?& ARRAY[
          'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
        ]::text[]
        AND summary - ARRAY[
          'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
        ]::text[] = '{}'::jsonb
        AND jsonb_typeof(summary->'schemaVersion') = 'string'
        AND jsonb_typeof(summary->'outcome') = 'string'
        AND jsonb_typeof(summary->'nodeKind') = 'string'
        AND jsonb_typeof(summary->'reasonCode') = 'string'
        AND jsonb_typeof(summary->'resultCode') = 'string'
        AND summary->>'schemaVersion' = 'flow-runtime-trace.v1'
        AND summary->>'nodeKind' IN (
          'booking_confirmed', 'manual_client', 'birth_data_available', 'astrologer_work_item',
          'astrologer_approval', 'completed', 'suppressed', 'failed'
        )
        AND length(summary->>'resultCode') BETWEEN 1 AND 160
        AND summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        AND (
          (
            event_type = 'run_completed'
            AND summary->>'outcome' = 'terminal'
            AND summary->>'reasonCode' = 'FLOW_GOAL_REACHED'
          )
          OR (
            event_type = 'token_lease_expired'
            AND summary->>'outcome' = 'lease_expired'
            AND summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
            AND summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          )
        )
      );

    DROP TRIGGER flow_run_event_command_consistency ON flow_run_events;
    DROP FUNCTION elevenhouse_assert_flow_run_event_command();
    DROP TABLE flow_runtime_command_outcomes;
    DROP TABLE flow_runtime_commands;
    DROP FUNCTION elevenhouse_guard_flow_runtime_command_mutation();
    DROP FUNCTION elevenhouse_guard_flow_runtime_outcome_mutation();
    DROP FUNCTION elevenhouse_assert_flow_runtime_command_outcome();
  `);
}

async function downgradeCalculationIdentityIndexes(databaseClient: Client): Promise<void> {
  await databaseClient.query(`
    ALTER TABLE calculation_participants
      DROP CONSTRAINT calculation_participants_record_role_unique,
      DROP CONSTRAINT calculation_participants_record_order_unique;
    CREATE INDEX calculation_participants_record_role_idx
      ON calculation_participants (calculation_id, role);
    CREATE INDEX calculation_participants_record_order_idx
      ON calculation_participants (calculation_id, "order");
    DROP INDEX calculation_records_exact_request_unique;
    CREATE UNIQUE INDEX calculation_records_exact_request_unique
      ON calculation_records (
        owner_user_id, module, mode, method_code, request_fingerprint
      );
  `);
}

async function installCurrentChartNoopSentinel(databaseClient: Client): Promise<void> {
  await databaseClient.query(`
    INSERT INTO users (id) VALUES
      ('98000000-0000-4000-8000-000000000001'),
      ('98000000-0000-4000-8000-000000000002');
    INSERT INTO chart_calculation_jobs (
      id,
      owner_user_id,
      client_id,
      method,
      method_version,
      status,
      input_fingerprint,
      input_snapshot,
      settings_snapshot,
      participant_snapshot,
      provider,
      schema_version,
      execution_profile,
      attempts,
      max_attempts,
      lease_generation,
      created_at,
      updated_at
    ) VALUES (
      '98000000-0000-4000-8000-000000000003',
      '98000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000002',
      'natal',
      'chart.natal.kerykeion-5.12.v2',
      'queued',
      'sha256:${"8".repeat(64)}',
      '{}',
      '{}',
      '[{"role":"subject","clientId":"98000000-0000-4000-8000-000000000002"}]',
      'kerykeion',
      'chart-result.v2',
      '{
        "provider":"kerykeion",
        "kerykeionVersion":"5.12.9",
        "pyswissephVersion":"2.10.3.2",
        "expectedEphemeris":"moshier",
        "expectedEphemerisFlags":["FLG_MOSEPH","FLG_SPEED"],
        "expectedEphemerisDataRevision":null
      }',
      0,
      3,
      0,
      '2026-08-03T12:00:00.000Z',
      '2026-08-03T12:00:00.000Z'
    );
  `);
}

async function readCurrentFlowAdditiveSafetyEvidence(databaseClient: Client): Promise<{
  readonly completedNodeConstraintCount: string;
  readonly manifestConstraintCount: string;
}> {
  const result = await databaseClient.query<{
    completed_node_constraint_count: string;
    manifest_constraint_count: string;
  }>(`
    SELECT
      (SELECT count(*)::text
         FROM pg_constraint
        WHERE conrelid = 'flow_execution_tokens'::regclass
          AND conname = 'flow_execution_tokens_completed_node_check'
          AND convalidated) AS completed_node_constraint_count,
      (SELECT count(*)::text
         FROM pg_constraint
        WHERE conrelid = 'flow_versions'::regclass
          AND conname = 'flow_versions_capability_manifest_schema_check'
          AND convalidated) AS manifest_constraint_count
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Expected current Flow additive safety evidence");
  return {
    completedNodeConstraintCount: row.completed_node_constraint_count,
    manifestConstraintCount: row.manifest_constraint_count
  };
}

async function readChartReconciliationEvidence(databaseClient: Client): Promise<{
  readonly table_oid: string;
  readonly columns: unknown;
  readonly constraints: unknown;
  readonly indexes: unknown;
  readonly jobs: unknown;
  readonly chart_calculations: unknown;
  readonly chart_participants: unknown;
  readonly ledger: unknown;
}> {
  const result = await databaseClient.query<{
    table_oid: string;
    columns: unknown;
    constraints: unknown;
    indexes: unknown;
    jobs: unknown;
    chart_calculations: unknown;
    chart_participants: unknown;
    ledger: unknown;
  }>(`
    SELECT
      to_regclass('public.chart_calculation_jobs')::oid::text AS table_oid,
      coalesce((
        SELECT jsonb_agg(to_jsonb(column_record) ORDER BY column_record.ordinal_position)
          FROM (
            SELECT
              ordinal_position,
              column_name,
              udt_name,
              is_nullable,
              column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'chart_calculation_jobs'
          ) AS column_record
      ), '[]'::jsonb) AS columns,
      coalesce((
        SELECT jsonb_agg(to_jsonb(constraint_record) ORDER BY constraint_record.name)
          FROM (
            SELECT
              conname AS name,
              contype AS type,
              convalidated AS validated,
              pg_get_constraintdef(oid, false) AS definition
            FROM pg_constraint
            WHERE conrelid = 'chart_calculation_jobs'::regclass
              AND contype <> 't'
          ) AS constraint_record
      ), '[]'::jsonb) AS constraints,
      coalesce((
        SELECT jsonb_agg(to_jsonb(index_record) ORDER BY index_record.name)
          FROM (
            SELECT
              index_catalog.indexname AS name,
              index_catalog.indexdef AS definition,
              index_state.indisvalid AS valid,
              index_state.indisready AS ready
            FROM pg_indexes AS index_catalog
            JOIN pg_class AS index_relation
              ON index_relation.relname = index_catalog.indexname
            JOIN pg_namespace AS namespace
              ON namespace.oid = index_relation.relnamespace
             AND namespace.nspname = index_catalog.schemaname
            JOIN pg_index AS index_state
              ON index_state.indexrelid = index_relation.oid
            WHERE index_catalog.schemaname = 'public'
              AND index_catalog.tablename = 'chart_calculation_jobs'
          ) AS index_record
      ), '[]'::jsonb) AS indexes,
      coalesce((
        SELECT jsonb_agg(
          to_jsonb(job) || jsonb_build_object('__xmin', job.xmin::text)
          ORDER BY job.id
        )
        FROM chart_calculation_jobs AS job
      ), '[]'::jsonb) AS jobs,
      coalesce((
        SELECT jsonb_agg(
          to_jsonb(calculation) || jsonb_build_object('__xmin', calculation.xmin::text)
          ORDER BY calculation.id
        )
        FROM calculation_records AS calculation
        WHERE calculation.module = 'chart'
      ), '[]'::jsonb) AS chart_calculations,
      coalesce((
        SELECT jsonb_agg(
          to_jsonb(participant) || jsonb_build_object('__xmin', participant.xmin::text)
          ORDER BY participant.calculation_id, participant."order", participant.id
        )
        FROM calculation_participants AS participant
        JOIN calculation_records AS calculation
          ON calculation.id = participant.calculation_id
        WHERE calculation.module = 'chart'
      ), '[]'::jsonb) AS chart_participants,
      coalesce((
        SELECT jsonb_agg(
          to_jsonb(migration) || jsonb_build_object('__xmin', migration.xmin::text)
          ORDER BY migration.id
        )
        FROM drizzle.__drizzle_migrations AS migration
      ), '[]'::jsonb) AS ledger
  `);
  const evidence = result.rows[0];
  if (!evidence) throw new Error("Expected chart reconciliation evidence");
  return evidence;
}

async function installPreviousRuntimeLedger(databaseClient: Client): Promise<void> {
  await databaseClient.query(`
    CREATE SCHEMA drizzle;
    CREATE TABLE drizzle.__drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('${previousRuntimeKernelBaseline.hash}', ${previousRuntimeKernelBaseline.createdAt});
  `);
}

async function installLegacyChartJobsFixture(
  databaseClient: Client,
  options: {
    readonly ambiguousActivePair: boolean;
    readonly duplicateParticipantIdentity?: boolean;
    readonly mismatchedSucceededRelationship?: boolean;
  }
): Promise<void> {
  const activePartnerId = options.ambiguousActivePair
    ? "92000000-0000-4000-8000-000000000001"
    : "93000000-0000-4000-8000-000000000001";
  const succeededFixture = buildLegacySynastryFixture(
    options.mismatchedSucceededRelationship
      ? "97000000-0000-4000-8000-000000000001"
      : "93000000-0000-4000-8000-000000000001"
  );

  await databaseClient.query(`
    DROP TABLE chart_calculation_jobs;
    DROP FUNCTION elevenhouse_guard_chart_job_result_checksum_mutation();
    CREATE TABLE chart_calculation_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      owner_user_id uuid NOT NULL,
      client_id uuid NOT NULL,
      result_calculation_id uuid,
      method text DEFAULT 'natal' NOT NULL,
      status text DEFAULT 'queued' NOT NULL,
      input_fingerprint text NOT NULL,
      input_snapshot jsonb NOT NULL,
      settings_snapshot jsonb NOT NULL,
      provider text DEFAULT 'kerykeion' NOT NULL,
      schema_version text DEFAULT 'chart-result.v1' NOT NULL,
      attempts integer DEFAULT 0 NOT NULL,
      max_attempts integer DEFAULT 3 NOT NULL,
      locked_by text,
      locked_until timestamptz,
      last_error_code text,
      last_error_message text,
      started_at timestamptz,
      finished_at timestamptz,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL,
      CONSTRAINT chart_calculation_jobs_owner_user_id_users_id_fk
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT chart_calculation_jobs_client_id_client_profiles_user_id_fk
        FOREIGN KEY (client_id) REFERENCES client_profiles(user_id) ON DELETE CASCADE,
      CONSTRAINT chart_calculation_jobs_result_calculation_id_calculation_records_id_fk
        FOREIGN KEY (result_calculation_id) REFERENCES calculation_records(id) ON DELETE SET NULL,
      CONSTRAINT chart_calculation_jobs_method_check CHECK (
        method IN ('natal', 'transit', 'synastry', 'composite', 'solar_return', 'progression')
      ),
      CONSTRAINT chart_calculation_jobs_status_check CHECK (
        status IN ('queued', 'processing', 'succeeded', 'failed')
      ),
      CONSTRAINT chart_calculation_jobs_provider_check CHECK (provider IN ('kerykeion')),
      CONSTRAINT chart_calculation_jobs_schema_version_check CHECK (
        schema_version IN ('chart-result.v1')
      ),
      CONSTRAINT chart_calculation_jobs_input_fingerprint_check CHECK (
        input_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      ),
      CONSTRAINT chart_calculation_jobs_input_snapshot_object_check CHECK (
        jsonb_typeof(input_snapshot) = 'object'
      ),
      CONSTRAINT chart_calculation_jobs_settings_snapshot_object_check CHECK (
        jsonb_typeof(settings_snapshot) = 'object'
      ),
      CONSTRAINT chart_calculation_jobs_attempts_check CHECK (attempts >= 0),
      CONSTRAINT chart_calculation_jobs_max_attempts_check CHECK (max_attempts > 0)
    );
    CREATE INDEX chart_calculation_jobs_owner_idx
      ON chart_calculation_jobs (owner_user_id);
    CREATE INDEX chart_calculation_jobs_client_idx
      ON chart_calculation_jobs (client_id);
    CREATE INDEX chart_calculation_jobs_status_updated_idx
      ON chart_calculation_jobs (status, updated_at);
    CREATE UNIQUE INDEX chart_calculation_jobs_active_fingerprint_unique
      ON chart_calculation_jobs (owner_user_id, input_fingerprint)
      WHERE status IN ('queued', 'processing');
    CREATE UNIQUE INDEX chart_calculation_jobs_success_fingerprint_unique
      ON chart_calculation_jobs (owner_user_id, input_fingerprint)
      WHERE status = 'succeeded';

    INSERT INTO users (id) VALUES
      ('91000000-0000-4000-8000-000000000001'),
      ('92000000-0000-4000-8000-000000000001'),
      ('93000000-0000-4000-8000-000000000001'),
      ('97000000-0000-4000-8000-000000000001');
    INSERT INTO client_profiles (user_id) VALUES
      ('92000000-0000-4000-8000-000000000001'),
      ('93000000-0000-4000-8000-000000000001'),
      ('97000000-0000-4000-8000-000000000001');
  `);

  await databaseClient.query(
    `
    INSERT INTO calculation_records (
      id, owner_user_id, module, mode, method_code, title, status, request_fingerprint,
      input_data, result_data, result_summary, result_checksum
    ) VALUES (
      '94000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      'chart',
      'individual',
      'synastry',
      'Legacy synastry result',
      'calculated',
      $1,
      $2::jsonb,
      $3::jsonb,
      $4::jsonb,
      $5
    );
  `,
    [
      succeededFixture.inputFingerprint,
      JSON.stringify(succeededFixture.calculationInputData),
      JSON.stringify(succeededFixture.resultData),
      JSON.stringify(succeededFixture.resultSummary),
      succeededFixture.resultChecksum
    ]
  );

  await databaseClient.query(`
    INSERT INTO calculation_participants (
      id, calculation_id, role, source, client_id, display_name, "order"
    ) VALUES (
      '96000000-0000-4000-8000-000000000001',
      '94000000-0000-4000-8000-000000000001',
      'subject',
      'crm_client',
      '92000000-0000-4000-8000-000000000001',
      'Legacy subject',
      0
    );
    ${
      options.duplicateParticipantIdentity
        ? `INSERT INTO calculation_participants (
             id, calculation_id, role, source, client_id, display_name, "order"
           ) VALUES (
             '96000000-0000-4000-8000-000000000003',
             '94000000-0000-4000-8000-000000000001',
             'subject',
             'crm_client',
             '92000000-0000-4000-8000-000000000001',
             'Duplicate legacy subject',
             1
           );`
        : ""
    }
  `);

  await databaseClient.query(
    `
    INSERT INTO chart_calculation_jobs (
      id, owner_user_id, client_id, result_calculation_id, method, status,
      input_fingerprint, input_snapshot, settings_snapshot, schema_version,
      attempts, max_attempts, locked_by, locked_until, started_at, finished_at,
      created_at, updated_at
    ) VALUES
      (
        '95000000-0000-4000-8000-000000000001',
        '91000000-0000-4000-8000-000000000001',
        '92000000-0000-4000-8000-000000000001',
        NULL,
        'natal',
        'queued',
        'sha256:${"1".repeat(64)}',
        '{}',
        '{}',
        'chart-result.v1',
        0,
        3,
        NULL,
        NULL,
        NULL,
        NULL,
        '2026-08-01T10:00:00.000Z',
        '2026-08-01T10:00:00.000Z'
      ),
      (
        '95000000-0000-4000-8000-000000000002',
        '91000000-0000-4000-8000-000000000001',
        '92000000-0000-4000-8000-000000000001',
        '94000000-0000-4000-8000-000000000001',
        'synastry',
        'succeeded',
        $1,
        $2::jsonb,
        $3::jsonb,
        'chart-result.v1',
        1,
        3,
        NULL,
        NULL,
        '2026-08-01T10:01:00.000Z',
        '2026-08-01T10:02:00.000Z',
        '2026-08-01T10:00:00.000Z',
        '2026-08-01T10:02:00.000Z'
      ),
      (
        '95000000-0000-4000-8000-000000000003',
        '91000000-0000-4000-8000-000000000001',
        '92000000-0000-4000-8000-000000000001',
        NULL,
        'composite',
        'processing',
        'sha256:${"3".repeat(64)}',
        '{"relationshipSnapshot":{"primaryClientId":"92000000-0000-4000-8000-000000000001","partnerClientId":"${activePartnerId}"}}',
        '{}',
        'chart-result.v1',
        1,
        3,
        NULL,
        NULL,
        '2026-08-01T10:03:00.000Z',
        NULL,
        '2026-08-01T10:03:00.000Z',
        '2026-08-01T10:03:00.000Z'
      );
  `,
    [
      succeededFixture.inputFingerprint,
      JSON.stringify(succeededFixture.jobInputSnapshot),
      JSON.stringify(succeededFixture.settingsSnapshot)
    ]
  );

  await databaseClient.query(`
    INSERT INTO chart_calculation_jobs (
      id, owner_user_id, client_id, result_calculation_id, method, status,
      input_fingerprint, input_snapshot, settings_snapshot, schema_version,
      attempts, max_attempts, locked_by, locked_until, last_error_code,
      last_error_message, started_at, finished_at, created_at, updated_at
    ) VALUES (
      '95000000-0000-4000-8000-000000000004',
      '91000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000001',
      NULL,
      'natal',
      'failed',
      'sha256:${"4".repeat(64)}',
      '{}',
      '{}',
      'chart-result.v1',
      1,
      3,
      NULL,
      NULL,
      'postgres_unique_violation_private',
      'duplicate key for client anton.private@example.com; SELECT * FROM client_profiles',
      '2026-08-01T10:04:00.000Z',
      '2026-08-01T10:05:00.000Z',
      '2026-08-01T10:04:00.000Z',
      '2026-08-01T10:05:00.000Z'
    );
  `);
}

async function readSucceededLegacyChartHistory(databaseClient: Client): Promise<{
  readonly legacy_job: unknown;
  readonly calculation: unknown;
  readonly participants: unknown;
}> {
  const result = await databaseClient.query<{
    legacy_job: unknown;
    calculation: unknown;
    participants: unknown;
  }>(`
    SELECT
      to_jsonb(job) - ARRAY[
        'target_calculation_id',
        'expected_source_checksum',
        'interpretation_mode',
        'method_version',
        'participant_snapshot',
        'execution_profile',
        'lease_generation',
        'result_checksum',
        'result_reproducibility_fingerprint'
      ]::text[] AS legacy_job,
      to_jsonb(calculation) AS calculation,
      coalesce((
        SELECT jsonb_agg(to_jsonb(participant) ORDER BY participant."order", participant.id)
          FROM calculation_participants AS participant
         WHERE participant.calculation_id = calculation.id
      ), '[]'::jsonb) AS participants
    FROM chart_calculation_jobs AS job
    JOIN calculation_records AS calculation
      ON calculation.id = job.result_calculation_id
    WHERE job.id = '95000000-0000-4000-8000-000000000002'
  `);
  const history = result.rows[0];
  if (!history) throw new Error("Expected succeeded legacy chart history");
  return history;
}

function buildLegacySynastryFixture(resultPartnerClientId: string) {
  const settingsSnapshot = {
    zodiac: "tropical" as const,
    houseSystem: "placidus" as const,
    nodeType: "true" as const,
    aspectPreset: "major" as const,
    orbMultiplier: 1
  };
  const inputSnapshot = {
    birthDate: "1990-07-15",
    birthTime: "10:30",
    timezone: "Europe/Rome",
    latitude: 41.9028,
    longitude: 12.4964,
    birthTimePrecision: "exact" as const
  };
  const partnerInputSnapshot = {
    birthDate: "1992-08-11",
    birthTime: "22:15",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173,
    birthTimePrecision: "approximate" as const
  };
  const jobInputSnapshot = {
    inputSnapshot,
    partnerInputSnapshot,
    relationshipSnapshot: {
      primaryClientId: "92000000-0000-4000-8000-000000000001",
      partnerClientId: "93000000-0000-4000-8000-000000000001"
    }
  };
  const resultData = storedChartCalculationPayloadSchema.parse({
    schemaVersion: "chart-result.v1",
    method: "synastry",
    provider: {
      name: "kerykeion",
      version: "5.12.9",
      ephemeris: "swiss-ephemeris"
    },
    settings: settingsSnapshot,
    inputSnapshot,
    partnerInputSnapshot,
    relationshipSnapshot: {
      primaryClientId: "92000000-0000-4000-8000-000000000001",
      partnerClientId: resultPartnerClientId
    },
    result: {
      primary: legacyChartRenderResult(),
      partner: legacyChartRenderResult(),
      aspectsBetween: [],
      houseOverlays: [],
      warnings: []
    }
  });
  if (resultData.schemaVersion !== "chart-result.v1" || resultData.method !== "synastry") {
    throw new Error("Expected a contract-valid V1 synastry fixture");
  }
  const inputFingerprint = sha256CanonicalJson({
    schemaVersion: "chart-request.v1",
    method: "synastry",
    settings: settingsSnapshot,
    inputSnapshot: jobInputSnapshot
  } as CanonicalJson);
  return {
    inputFingerprint,
    jobInputSnapshot,
    settingsSnapshot,
    calculationInputData: {
      inputSnapshot: jobInputSnapshot,
      settings: settingsSnapshot
    },
    resultData,
    resultSummary: {
      provider: "kerykeion",
      primaryPointCount: resultData.result.primary.points.length,
      partnerPointCount: resultData.result.partner.points.length,
      synastryAspectCount: resultData.result.aspectsBetween.length,
      houseOverlayCount: resultData.result.houseOverlays.length,
      relationshipScore: null
    },
    resultChecksum: sha256CanonicalJson(resultData as CanonicalJson)
  };
}

function legacyChartRenderResult() {
  return {
    points: [
      "sun",
      "moon",
      "mercury",
      "venus",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
      "pluto",
      "ascendant",
      "midheaven",
      "north_node",
      "south_node"
    ].map((id, index) => ({
      id,
      label: id,
      longitude: index * 20,
      sign: "aries",
      signDegree: index % 29,
      house: index < 12 ? index + 1 : null,
      retrograde: false
    })),
    houses: Array.from({ length: 12 }, (_, index) => ({
      number: index + 1,
      longitude: index * 30,
      sign: "aries",
      signDegree: 0
    })),
    aspects: [],
    distributions: {
      elements: { fire: 3, earth: 2, air: 3, water: 2 },
      modalities: { cardinal: 4, fixed: 3, mutable: 3 },
      polarity: { masculine: 6, feminine: 4 }
    },
    warnings: []
  };
}

const legacyInput = {
  methodCode: "pythagorean",
  mode: "individual",
  participants: [
    {
      role: "subject",
      source: "crm_client",
      clientId: "40000000-0000-0000-0000-000000000001",
      displayName: "Legacy participant",
      fullName: "Иван Иванов",
      birthDate: "1990-01-02"
    }
  ],
  settings: {}
};
const legacyResult = {
  methodCode: "pythagorean",
  methodVersion: "legacy",
  mode: "individual",
  keyNumbers: {}
};
const legacyResultHash = createHash("sha256")
  .update(stableJson(legacyResult), "utf8")
  .digest("hex");
const currentParticipant = {
  calculationName: "Иван Иванов",
  calculationNameSource: "crm_display_name" as const,
  birthDate: "1990-01-02"
};
const currentPeriods = {};
const currentResult = calculateNumerologyIndividual({
  methodCode: "pythagorean",
  participant: currentParticipant,
  periods: currentPeriods
});
const currentInputData = {
  methodCode: "pythagorean",
  mode: "individual",
  participants: [
    {
      role: "subject",
      source: "crm_client",
      clientId: "40000000-0000-0000-0000-000000000001",
      ...currentParticipant
    }
  ],
  periods: currentPeriods
};
const legacyCompatibilityInput = {
  methodCode: "pythagorean",
  mode: "compatibility",
  participants: [
    {
      role: "subject",
      source: "crm_client",
      clientId: "40000000-0000-0000-0000-000000000001",
      displayName: "First participant",
      fullName: "Иван Иванов",
      birthDate: "1990-01-02"
    },
    {
      role: "partner",
      source: "manual",
      clientId: null,
      displayName: "Second participant",
      fullName: "Анна Петрова",
      birthDate: "1992-03-04"
    }
  ],
  settings: {}
};
const legacyCompatibilityResult = {
  methodCode: "pythagorean",
  methodVersion: "legacy",
  mode: "compatibility",
  pairNumber: 7
};
const legacyCompatibilityResultHash = createHash("sha256")
  .update(stableJson(legacyCompatibilityResult), "utf8")
  .digest("hex");
const secondCurrentParticipant = {
  calculationName: "Анна Петрова",
  calculationNameSource: "manual_entry" as const,
  birthDate: "1992-03-04"
};
const currentCompatibilityResult = calculateNumerologyCompatibility({
  methodCode: "pythagorean",
  participants: {
    first: currentParticipant,
    second: secondCurrentParticipant
  },
  periods: currentPeriods
});
const currentCompatibilityInputData = {
  methodCode: "pythagorean",
  mode: "compatibility",
  participants: [
    {
      role: "subject",
      source: "crm_client",
      clientId: "40000000-0000-0000-0000-000000000001",
      ...currentParticipant
    },
    {
      role: "partner",
      source: "manual",
      clientId: null,
      ...secondCurrentParticipant
    }
  ],
  periods: currentPeriods
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function legacyProductionFixtureSql(): string {
  return `
    CREATE SCHEMA drizzle;
    CREATE TABLE drizzle.__drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
      ('9a042354672db97fda448a68804c61952d81d2c39e4b67b8581de04984c3fff8', 1782996784018),
      ('9cfb3eebacfd55d703748c65b7a6210c8037cb881f66c3d7bf110d1489357baa', 1783327724152),
      ('c52a5a3cc5c9acd8e50b32643661dbe8f922844711ad08a8e30b22d72eb09829', 1783335783810),
      ('3d071b976aeeb1b5a4954aef46eadce7209a5ecef66a81e1680c3f3986694bd7', 1783969326835),
      ('911332efe5ba14b352244a8176412cf637dccdb25141aa1792dcad35c63831de', 1784111509389);

    CREATE TABLE users (id uuid PRIMARY KEY);
    ${outboxEventsPredecessorFixtureSql()}
    CREATE TABLE client_astrologer_relationships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      client_user_id uuid NOT NULL,
      astrologer_user_id uuid NOT NULL,
      source text NOT NULL,
      status text DEFAULT 'active' NOT NULL,
      first_linked_at timestamptz NOT NULL,
      last_linked_at timestamptz NOT NULL,
      archived_at timestamptz,
      blocked_at timestamptz,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL,
      CONSTRAINT client_astrologer_relationships_source_check
        CHECK (source IN ('direct_link', 'booking', 'order', 'lead_magnet', 'manual')),
      CONSTRAINT client_astrologer_relationships_status_check
        CHECK (status IN ('active', 'archived', 'blocked')),
      CONSTRAINT client_astrologer_relationships_distinct_users_check
        CHECK (client_user_id <> astrologer_user_id),
      CONSTRAINT client_astrologer_relationships_client_user_id_users_id_fk
        FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT client_astrologer_relationships_astrologer_user_id_users_id_fk
        FOREIGN KEY (astrologer_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX client_astrologer_relationships_unique
      ON client_astrologer_relationships (client_user_id, astrologer_user_id);
    CREATE INDEX client_astrologer_relationships_astrologer_status_idx
      ON client_astrologer_relationships (astrologer_user_id, status);
    CREATE INDEX client_astrologer_relationships_client_status_idx
      ON client_astrologer_relationships (client_user_id, status);
    CREATE TABLE products (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE media_assets (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose text NOT NULL,
      status text NOT NULL DEFAULT 'uploading',
      visibility text NOT NULL,
      storage_bucket text NOT NULL,
      storage_key text NOT NULL,
      original_file_name text NOT NULL,
      mime_type text NOT NULL,
      size_bytes integer NOT NULL,
      checksum_sha256 text,
      width integer,
      height integer,
      alt_text text,
      failure_reason text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT media_assets_storage_bucket_storage_key_unique UNIQUE (storage_bucket, storage_key),
      CONSTRAINT media_assets_purpose_check CHECK (purpose IN ('product_cover', 'profile_avatar', 'profile_cover', 'verification_identity_document', 'verification_qualification_document')),
      CONSTRAINT media_assets_status_check CHECK (status IN ('uploading', 'processing', 'ready', 'failed', 'deleted')),
      CONSTRAINT media_assets_visibility_check CHECK (visibility IN ('public', 'private')),
      CONSTRAINT media_assets_mime_type_check CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf')),
      CONSTRAINT media_assets_size_bytes_check CHECK (size_bytes > 0)
    );

    CREATE TABLE calculation_records (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      module text NOT NULL,
      mode text NOT NULL,
      method_code text NOT NULL,
      current_method_version text NOT NULL,
      title text NOT NULL,
      status text NOT NULL DEFAULT 'calculated',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE calculation_participants (
      id uuid PRIMARY KEY,
      calculation_id uuid NOT NULL REFERENCES calculation_records(id) ON DELETE CASCADE,
      role text NOT NULL,
      source text NOT NULL,
      client_id uuid,
      display_name text NOT NULL,
      birth_date text,
      input_snapshot jsonb NOT NULL,
      manually_overridden boolean NOT NULL DEFAULT false,
      "order" integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE calculation_versions (
      id uuid PRIMARY KEY,
      calculation_id uuid NOT NULL REFERENCES calculation_records(id) ON DELETE CASCADE,
      version_number integer NOT NULL,
      method_version text NOT NULL,
      settings_snapshot jsonb NOT NULL,
      input_snapshot jsonb NOT NULL,
      result_snapshot jsonb NOT NULL,
      result_summary jsonb NOT NULL,
      result_checksum text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT calculation_versions_identity_unique UNIQUE (id, calculation_id)
    );
    CREATE TABLE calculation_interpretations (
      id uuid PRIMARY KEY,
      calculation_id uuid NOT NULL REFERENCES calculation_records(id) ON DELETE CASCADE,
      version_id uuid NOT NULL,
      source text NOT NULL,
      status text NOT NULL DEFAULT 'draft',
      text text NOT NULL,
      model_id text,
      prompt_version text,
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT calculation_interpretations_version_calculation_fk FOREIGN KEY (version_id, calculation_id) REFERENCES calculation_versions(id, calculation_id) ON DELETE CASCADE
    );
    CREATE INDEX calculation_interpretations_version_idx ON calculation_interpretations(version_id);
    CREATE TABLE calculation_artifacts (
      id uuid PRIMARY KEY,
      calculation_id uuid NOT NULL REFERENCES calculation_records(id) ON DELETE CASCADE,
      version_id uuid NOT NULL,
      media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
      artifact_type text NOT NULL,
      status text NOT NULL DEFAULT 'generating',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT calculation_artifacts_version_calculation_fk FOREIGN KEY (version_id, calculation_id) REFERENCES calculation_versions(id, calculation_id) ON DELETE CASCADE
    );
    CREATE INDEX calculation_artifacts_version_idx ON calculation_artifacts(version_id);

    INSERT INTO users (id) VALUES ('00000000-0000-0000-0000-000000000001');
    INSERT INTO calculation_records (
      id, owner_user_id, module, mode, method_code, current_method_version, title, status
    ) VALUES
    (
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'numerology', 'individual', 'pythagorean', 'legacy', 'Legacy calculation', 'calculated'
    ),
    (
      '10000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000001',
      'numerology', 'compatibility', 'pythagorean', 'legacy', 'Legacy compatibility', 'calculated'
    );
    INSERT INTO calculation_versions (
      id, calculation_id, version_number, method_version, settings_snapshot,
      input_snapshot, result_snapshot, result_summary, result_checksum
    ) VALUES
    (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      1, 'legacy', '{}', '${JSON.stringify(legacyInput)}', '${JSON.stringify(legacyResult)}', '{}',
      '${legacyResultHash}'
    ),
    (
      '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000002',
      1, 'legacy', '{}', '${JSON.stringify(legacyCompatibilityInput)}', '${JSON.stringify(legacyCompatibilityResult)}', '{}',
      '${legacyCompatibilityResultHash}'
    );
    INSERT INTO calculation_participants (
      id, calculation_id, role, source, client_id, display_name, input_snapshot, "order"
    ) VALUES
    (
      '30000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'subject', 'crm_client', '40000000-0000-0000-0000-000000000001', 'Legacy participant', '{}', 0
    ),
    (
      '30000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000002',
      'subject', 'crm_client', '40000000-0000-0000-0000-000000000001', 'First participant', '{}', 0
    ),
    (
      '30000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000002',
      'partner', 'manual', NULL, 'Second participant', '{}', 1
    );
  `;
}

function previousProductionFixtureSql(): string {
  return `
    CREATE SCHEMA drizzle;
    CREATE TABLE drizzle.__drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
      ('${previousBaseline.hash}', ${previousBaseline.createdAt});

    CREATE TABLE users (id uuid PRIMARY KEY);
    ${outboxEventsPredecessorFixtureSql()}
    CREATE TABLE client_astrologer_relationships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      client_user_id uuid NOT NULL,
      astrologer_user_id uuid NOT NULL,
      source text NOT NULL,
      status text DEFAULT 'active' NOT NULL,
      first_linked_at timestamptz NOT NULL,
      last_linked_at timestamptz NOT NULL,
      archived_at timestamptz,
      blocked_at timestamptz,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL,
      CONSTRAINT client_astrologer_relationships_source_check
        CHECK (source IN ('direct_link', 'booking', 'order', 'lead_magnet', 'manual')),
      CONSTRAINT client_astrologer_relationships_status_check
        CHECK (status IN ('active', 'archived', 'blocked')),
      CONSTRAINT client_astrologer_relationships_distinct_users_check
        CHECK (client_user_id <> astrologer_user_id),
      CONSTRAINT client_astrologer_relationships_client_user_id_users_id_fk
        FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT client_astrologer_relationships_astrologer_user_id_users_id_fk
        FOREIGN KEY (astrologer_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX client_astrologer_relationships_unique
      ON client_astrologer_relationships (client_user_id, astrologer_user_id);
    CREATE INDEX client_astrologer_relationships_astrologer_status_idx
      ON client_astrologer_relationships (astrologer_user_id, status);
    CREATE INDEX client_astrologer_relationships_client_status_idx
      ON client_astrologer_relationships (client_user_id, status);
    CREATE TABLE client_birth_data (
      id uuid PRIMARY KEY,
      client_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label text,
      birth_date text,
      birth_time text,
      birth_time_precision text DEFAULT 'unknown' NOT NULL,
      birth_place_text text,
      birth_country_code text,
      birth_city text,
      birth_region text,
      birth_timezone text,
      birth_latitude double precision,
      birth_longitude double precision,
      source text DEFAULT 'client_profile' NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL,
      birth_time_dst_occurrence text,
      CONSTRAINT client_birth_data_time_precision_check CHECK (birth_time_precision in ('exact', 'approximate', 'unknown')),
      CONSTRAINT client_birth_data_source_check CHECK (source in ('client_profile', 'booking', 'import', 'manual'))
    );
    CREATE UNIQUE INDEX client_birth_data_client_unique ON client_birth_data (client_user_id);
    CREATE INDEX client_birth_data_client_idx ON client_birth_data (client_user_id);
    CREATE TABLE products (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL
    );
    CREATE TABLE calculation_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      owner_user_id uuid NOT NULL,
      module text NOT NULL,
      mode text NOT NULL,
      method_code text NOT NULL,
      title text NOT NULL,
      status text DEFAULT 'calculated' NOT NULL,
      request_fingerprint text NOT NULL,
      input_data jsonb NOT NULL,
      result_data jsonb NOT NULL,
      result_summary jsonb NOT NULL,
      result_checksum text NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL,
      CONSTRAINT calculation_records_id_owner_unique UNIQUE (id, owner_user_id),
      CONSTRAINT calculation_records_module_check
        CHECK (module IN ('numerology', 'chart', 'matrix', 'human_design')),
      CONSTRAINT calculation_records_mode_check CHECK (mode IN ('individual', 'compatibility')),
      CONSTRAINT calculation_records_status_check
        CHECK (status IN ('calculated', 'linked', 'published', 'archived')),
      CONSTRAINT calculation_records_request_fingerprint_check
        CHECK (request_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
      CONSTRAINT calculation_records_input_data_object_check
        CHECK (jsonb_typeof(input_data) = 'object'),
      CONSTRAINT calculation_records_result_data_object_check
        CHECK (jsonb_typeof(result_data) = 'object'),
      CONSTRAINT calculation_records_result_summary_object_check
        CHECK (jsonb_typeof(result_summary) = 'object'),
      CONSTRAINT calculation_records_result_checksum_check
        CHECK (result_checksum ~ '^sha256:[a-f0-9]{64}$'),
      CONSTRAINT calculation_records_owner_user_id_users_id_fk
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX calculation_records_exact_request_unique
      ON calculation_records (owner_user_id, module, mode, method_code, request_fingerprint);
    CREATE INDEX calculation_records_owner_updated_id_idx
      ON calculation_records (owner_user_id, updated_at, id);
    CREATE INDEX calculation_records_owner_status_updated_id_idx
      ON calculation_records (owner_user_id, status, updated_at, id);
    CREATE INDEX calculation_records_owner_module_created_id_idx
      ON calculation_records (owner_user_id, module, created_at, id);
    CREATE INDEX calculation_records_owner_status_module_created_id_idx
      ON calculation_records (owner_user_id, status, module, created_at, id);
    CREATE TABLE calculation_participants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      calculation_id uuid NOT NULL,
      role text NOT NULL,
      source text NOT NULL,
      client_id uuid,
      display_name text NOT NULL,
      "order" integer NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL,
      CONSTRAINT calculation_participants_role_check CHECK (role IN ('subject', 'partner')),
      CONSTRAINT calculation_participants_source_check CHECK (source IN ('crm_client', 'manual')),
      CONSTRAINT calculation_participants_source_client_check CHECK (
        (source = 'crm_client' AND client_id IS NOT NULL)
        OR (source = 'manual' AND client_id IS NULL)
      ),
      CONSTRAINT calculation_participants_order_check CHECK ("order" >= 0 AND "order" < 2),
      CONSTRAINT calculation_participants_calculation_id_calculation_records_id_fk
        FOREIGN KEY (calculation_id) REFERENCES calculation_records(id) ON DELETE CASCADE
    );
    CREATE INDEX calculation_participants_record_role_idx
      ON calculation_participants (calculation_id, role);
    CREATE INDEX calculation_participants_record_order_idx
      ON calculation_participants (calculation_id, "order");
    CREATE TABLE calculation_client_links (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      calculation_id uuid NOT NULL,
      client_id uuid NOT NULL,
      visibility text DEFAULT 'private_to_astrologer' NOT NULL,
      linked_at timestamptz NOT NULL,
      published_at timestamptz,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL,
      CONSTRAINT calculation_client_links_visibility_check
        CHECK (visibility IN ('private_to_astrologer', 'visible_to_client')),
      CONSTRAINT calculation_client_links_published_at_check
        CHECK (visibility <> 'visible_to_client' OR published_at IS NOT NULL),
      CONSTRAINT calculation_client_links_calculation_id_calculation_records_id_fk
        FOREIGN KEY (calculation_id) REFERENCES calculation_records(id) ON DELETE CASCADE
    );
    CREATE INDEX calculation_client_links_record_idx
      ON calculation_client_links (calculation_id);
    CREATE INDEX calculation_client_links_client_idx ON calculation_client_links (client_id);
    CREATE UNIQUE INDEX calculation_client_links_record_client_unique
      ON calculation_client_links (calculation_id, client_id);
    CREATE TABLE calculation_interpretations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      calculation_id uuid NOT NULL,
      source text NOT NULL,
      status text DEFAULT 'draft' NOT NULL,
      text text NOT NULL,
      model_id text,
      prompt_version text,
      approved_at timestamptz,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL,
      CONSTRAINT calculation_interpretations_source_check CHECK (source IN ('ai', 'manual')),
      CONSTRAINT calculation_interpretations_status_check CHECK (status IN ('draft', 'approved')),
      CONSTRAINT calculation_interpretations_approved_at_check
        CHECK (status <> 'approved' OR approved_at IS NOT NULL),
      CONSTRAINT calculation_interpretations_calculation_id_calculation_records_id_fk
        FOREIGN KEY (calculation_id) REFERENCES calculation_records(id) ON DELETE CASCADE
    );
    CREATE INDEX calculation_interpretations_record_idx
      ON calculation_interpretations (calculation_id);
    CREATE TABLE calculation_pdf_jobs (
      id uuid PRIMARY KEY,
      document_fingerprint text NOT NULL
    );
    CREATE TABLE matrix_notes (id uuid PRIMARY KEY);
    CREATE TABLE matrix_report_drafts (id uuid PRIMARY KEY);
    CREATE TABLE flows (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      owner_user_id uuid NOT NULL,
      name text NOT NULL,
      status text DEFAULT 'draft' NOT NULL,
      approval_mode text DEFAULT 'manual_approve' NOT NULL,
      draft_graph jsonb NOT NULL,
      published_version_id uuid,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL,
      published_at timestamptz,
      CONSTRAINT flows_id_owner_unique UNIQUE (id, owner_user_id),
      CONSTRAINT flows_name_length_check CHECK (length(trim(name)) BETWEEN 1 AND 180),
      CONSTRAINT flows_status_check CHECK (status IN ('draft', 'published', 'active', 'paused', 'archived')),
      CONSTRAINT flows_approval_mode_check CHECK (approval_mode IN ('draft_only', 'manual_approve', 'auto_internal', 'auto_send')),
      CONSTRAINT flows_draft_graph_object_check CHECK (jsonb_typeof(draft_graph) = 'object'),
      CONSTRAINT flows_owner_user_id_users_id_fk
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE flow_versions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      flow_id uuid NOT NULL,
      owner_user_id uuid NOT NULL,
      version integer NOT NULL,
      approval_mode text NOT NULL,
      graph jsonb NOT NULL,
      published_at timestamptz NOT NULL,
      CONSTRAINT flow_versions_id_owner_unique UNIQUE (id, owner_user_id),
      CONSTRAINT flow_versions_flow_id_id_owner_unique UNIQUE (flow_id, id, owner_user_id),
      CONSTRAINT flow_versions_positive_version_check CHECK (version > 0),
      CONSTRAINT flow_versions_approval_mode_check CHECK (approval_mode IN ('draft_only', 'manual_approve', 'auto_internal', 'auto_send')),
      CONSTRAINT flow_versions_graph_object_check CHECK (jsonb_typeof(graph) = 'object'),
      CONSTRAINT flow_versions_owner_user_id_users_id_fk
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT flow_versions_flow_owner_fk FOREIGN KEY (flow_id, owner_user_id)
        REFERENCES flows(id, owner_user_id) ON DELETE CASCADE
    );
    ALTER TABLE flows
      ADD CONSTRAINT flows_published_version_owner_fk
      FOREIGN KEY (id, published_version_id, owner_user_id)
      REFERENCES flow_versions(flow_id, id, owner_user_id) ON DELETE RESTRICT;
    CREATE INDEX flows_owner_status_updated_idx ON flows (owner_user_id, status, updated_at);
    CREATE INDEX flows_owner_name_idx ON flows (owner_user_id, name);
    CREATE INDEX flow_versions_owner_published_idx ON flow_versions (owner_user_id, published_at);
    CREATE UNIQUE INDEX flow_versions_flow_version_unique ON flow_versions (flow_id, version);

    INSERT INTO users (id) VALUES ('00000000-0000-0000-0000-000000000001');
    INSERT INTO client_birth_data (
      id, client_user_id, label, birth_date, birth_time, birth_time_precision, source
    ) VALUES (
      '40000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'Legacy birth profile',
      '1990-01-02',
      '12:30',
      'exact',
      'client_profile'
    );
    INSERT INTO products (id, owner_user_id, title) VALUES (
      '50000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'Persisted product'
    );
    INSERT INTO flows (
      id, owner_user_id, name, status, approval_mode, draft_graph,
      created_at, updated_at, published_at
    ) VALUES
    (
      '60000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'Persisted published flow',
      'active',
      'manual_approve',
      '${validLegacyFlowGraphWithoutSchemaJson}',
      '2026-07-28T10:00:00.000Z',
      '2026-07-28T11:00:00.000Z',
      '2026-07-28T11:00:00.000Z'
    ),
    (
      '60000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000001',
      'Persisted draft flow',
      'draft',
      'manual_approve',
      '${validLegacyFlowGraphWithoutSchemaJson}',
      '2026-07-28T12:00:00.000Z',
      '2026-07-28T12:00:00.000Z',
      NULL
    );
    INSERT INTO flow_versions (
      id, flow_id, owner_user_id, version, approval_mode, graph, published_at
    ) VALUES (
      '70000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      1,
      'manual_approve',
      '${validLegacyFlowGraphWithoutSchemaJson}',
      '2026-07-28T11:00:00.000Z'
    );
    UPDATE flows
       SET published_version_id = '70000000-0000-0000-0000-000000000001'
     WHERE id = '60000000-0000-0000-0000-000000000001';
  `;
}

function outboxEventsPredecessorFixtureSql(): string {
  return `
    CREATE TABLE outbox_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      event_type text NOT NULL,
      aggregate_id uuid NOT NULL,
      payload jsonb NOT NULL,
      status text DEFAULT 'pending' NOT NULL,
      attempts integer DEFAULT 0 NOT NULL,
      available_at timestamptz DEFAULT now() NOT NULL,
      locked_at timestamptz,
      published_at timestamptz,
      last_error text,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL,
      CONSTRAINT outbox_events_status_check
        CHECK (status IN ('pending', 'publishing', 'published')),
      CONSTRAINT outbox_events_attempts_check CHECK (attempts >= 0),
      CONSTRAINT outbox_events_pending_not_published_check
        CHECK (status <> 'pending' OR published_at IS NULL),
      CONSTRAINT outbox_events_publishing_locked_check
        CHECK (status <> 'publishing' OR locked_at IS NOT NULL),
      CONSTRAINT outbox_events_published_at_check
        CHECK (status <> 'published' OR published_at IS NOT NULL)
    );
    CREATE UNIQUE INDEX outbox_events_event_type_aggregate_id_unique
      ON outbox_events (event_type, aggregate_id);
    CREATE INDEX outbox_events_pending_index
      ON outbox_events (status, available_at, created_at);
    CREATE INDEX outbox_events_locked_at_index ON outbox_events (locked_at);
  `;
}
