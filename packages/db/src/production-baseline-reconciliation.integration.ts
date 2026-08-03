import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import {
  calculateNumerologyCompatibility,
  calculateNumerologyIndividual,
  sha256CanonicalJson
} from "@elevenhouse/domain";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  currentBaseline,
  previousBaseline,
  previousFlowDefinitionControlBaseline
} from "../scripts/production-baseline-plan";

const execFileAsync = promisify(execFile);
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;

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
      exclusion_count: "1",
      result_checksum: sha256CanonicalJson(currentResult),
      result_data: currentResult,
      input_data: currentInputData
    });
    expect(state.rows[0]?.request_fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);

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
      id uuid PRIMARY KEY,
      request_fingerprint text NOT NULL,
      input_data jsonb NOT NULL,
      result_data jsonb NOT NULL,
      result_summary jsonb NOT NULL,
      result_checksum text NOT NULL
    );
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
      '{"nodes": [], "edges": []}',
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
      '{"nodes": [], "edges": []}',
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
      '{"nodes": [], "edges": []}',
      '2026-07-28T11:00:00.000Z'
    );
    UPDATE flows
       SET published_version_id = '70000000-0000-0000-0000-000000000001'
     WHERE id = '60000000-0000-0000-0000-000000000001';
  `;
}
