import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import {
  calculateNumerologyCompatibility,
  calculateNumerologyIndividual,
  sha256CanonicalJson
} from "@elevenhouse/domain";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
          WHERE hash = '6f57cc8ca0c825a1f6da1911970a0d202d34c4177886d6d08f38a6edf2eb0860'
            AND created_at = 1784275401007) AS current_baseline_count,
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
      }>(`
        SELECT
          (SELECT count(*)::text
             FROM drizzle.__drizzle_migrations
            WHERE hash = '6f57cc8ca0c825a1f6da1911970a0d202d34c4177886d6d08f38a6edf2eb0860'
              AND created_at = 1784275401007) AS current_baseline_count,
          (SELECT title FROM products WHERE id = '50000000-0000-0000-0000-000000000001') AS product_title,
          to_regclass('public.availability_schedules')::text AS schedule_table,
          (SELECT count(*)::text FROM pg_constraint
            WHERE conname = 'schedule_reservations_active_owner_range_exclude'
              AND contype = 'x') AS exclusion_count
      `);
      expect(state.rows[0]).toEqual({
        current_baseline_count: "1",
        product_title: "Persisted product",
        schedule_table: "availability_schedules",
        exclusion_count: "1"
      });
    } finally {
      await previousClient?.end();
      await adminClient.query(`DROP DATABASE IF EXISTS ${previousDatabaseName} WITH (FORCE)`);
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
      ('3d071b976aeeb1b5a4954aef46eadce7209a5ecef66a81e1680c3f3986694bd7', 1783969326835);

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
      ('911332efe5ba14b352244a8176412cf637dccdb25141aa1792dcad35c63831de', 1784111509389);

    CREATE TABLE users (id uuid PRIMARY KEY);
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

    INSERT INTO users (id) VALUES ('00000000-0000-0000-0000-000000000001');
    INSERT INTO products (id, owner_user_id, title) VALUES (
      '50000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'Persisted product'
    );
  `;
}
