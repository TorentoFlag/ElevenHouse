import { numerologyResultSchema, type NumerologyResult } from "@elevenhouse/contracts";
import {
  calculateNumerologyCompatibility,
  calculateNumerologyIndividual,
  sha256CanonicalJson,
  stableJson,
  type CanonicalJson,
  type NumerologyParticipantInput
} from "@elevenhouse/domain";
import { Client, type QueryResultRow } from "pg";
import {
  classifyBaselineHistory,
  currentBaseline,
  schedulingBaselineDdl,
  type MigrationLedgerRow
} from "./production-baseline-plan";

type MigrationRow = QueryResultRow & MigrationLedgerRow;

type LegacyCalculationRow = QueryResultRow & {
  readonly id: string;
  readonly mode: string;
  readonly method_code: string;
  readonly input_snapshot: CanonicalJson;
  readonly result_snapshot: CanonicalJson;
  readonly result_summary: CanonicalJson;
  readonly result_checksum: string;
};

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required for production baseline reconciliation");

const client = new Client({ connectionString: databaseUrl });

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(46114587320260716)");

    const ledgerExists = await relationExists("drizzle.__drizzle_migrations");
    if (!ledgerExists) {
      if (await relationExists("public.users")) {
        throw new Error(
          "Refusing to reconcile a non-empty database without a Drizzle migration ledger"
        );
      }
      await client.query("COMMIT");
      console.log("Fresh database detected; the current baseline will be applied by Drizzle");
    } else {
      await client.query(
        "LOCK TABLE drizzle.__drizzle_migrations IN SHARE ROW EXCLUSIVE MODE"
      );
      const migrations = await readMigrationLedger();

      const history = classifyBaselineHistory(migrations);
      if (history === "unknown") {
        throw new Error("Refusing to reconcile an unknown migration history");
      }
      if (history === "current") {
        await reconcileClientBirthDataDstOccurrenceIfPresent();
        await assertCurrentSchemaShape();
        await client.query("COMMIT");
        console.log("Current production baseline is already recorded");
      } else {
        if (history === "legacy_calculations") {
          await assertLegacySchemaAndData();
          await migrateLegacyCalculations();
          await client.query(legacyToCurrentDdl);
        }
        await assertPreSchedulingSchemaShape();
        await client.query(schedulingBaselineDdl);
        await reconcileClientBirthDataDstOccurrenceIfPresent();
        await recordCurrentBaseline();
        await assertCurrentSchemaShape();
        await client.query("COMMIT");
        console.log(
          history === "legacy_calculations"
            ? "Legacy production baseline reconciled to the current baseline"
            : "Previous production baseline reconciled to the current baseline"
        );
      }
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function relationExists(qualifiedName: string): Promise<boolean> {
  const result = await client.query<{ relation: string | null }>(
    "SELECT to_regclass($1)::text AS relation",
    [qualifiedName]
  );
  return result.rows[0]?.relation !== null;
}

async function readMigrationLedger(): Promise<readonly MigrationRow[]> {
  const result = await client.query<MigrationRow>(
    "SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at, id"
  );
  return result.rows;
}

async function recordCurrentBaseline(): Promise<void> {
  await client.query(
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
    [currentBaseline.hash, currentBaseline.createdAt]
  );
}

async function assertLegacySchemaAndData(): Promise<void> {
  const expectedLegacyRelations = [
    "public.users",
    "public.media_assets",
    "public.calculation_records",
    "public.calculation_participants",
    "public.calculation_versions",
    "public.calculation_interpretations",
    "public.calculation_artifacts"
  ];
  for (const relation of expectedLegacyRelations) {
    if (!(await relationExists(relation))) {
      throw new Error(`Legacy production relation is missing: ${relation}`);
    }
  }

  for (const relation of [
    "public.calculation_pdf_jobs",
    "public.matrix_notes",
    "public.matrix_report_drafts"
  ]) {
    if (await relationExists(relation)) {
      throw new Error(`Legacy production relation is unexpectedly present: ${relation}`);
    }
  }

  const requiredColumns = await client.query<{ missing_count: string }>(`
    WITH required(table_name, column_name) AS (
      VALUES
        ('calculation_records', 'current_method_version'),
        ('calculation_participants', 'input_snapshot'),
        ('calculation_interpretations', 'version_id'),
        ('calculation_artifacts', 'version_id')
    )
    SELECT count(*)::text AS missing_count
      FROM required
     WHERE NOT EXISTS (
       SELECT 1
         FROM information_schema.columns columns
        WHERE columns.table_schema = 'public'
          AND columns.table_name = required.table_name
          AND columns.column_name = required.column_name
     )
  `);
  if (requiredColumns.rows[0]?.missing_count !== "0") {
    throw new Error("Legacy production schema does not have the expected calculation columns");
  }

  const invalidRecords = await client.query<{ invalid_count: string }>(`
    SELECT count(*)::text AS invalid_count
      FROM (
        SELECT records.id
          FROM calculation_records records
          LEFT JOIN calculation_versions versions ON versions.calculation_id = records.id
         GROUP BY records.id
        HAVING count(versions.id) <> 1 OR min(versions.version_number) <> 1
      ) invalid
  `);
  if (invalidRecords.rows[0]?.invalid_count !== "0") {
    throw new Error("Every legacy calculation must have exactly one version numbered 1");
  }

  const invalidParticipants = await client.query<{ invalid_count: string }>(`
    SELECT count(*)::text AS invalid_count
      FROM calculation_participants
     WHERE NOT (
       (source = 'crm_client' AND client_id IS NOT NULL)
       OR (source = 'manual' AND client_id IS NULL)
     )
        OR "order" < 0
        OR "order" >= 2
  `);
  if (invalidParticipants.rows[0]?.invalid_count !== "0") {
    throw new Error("Legacy calculation participants violate the current identity invariants");
  }
}

async function migrateLegacyCalculations(): Promise<void> {
  await client.query(`
    ALTER TABLE calculation_records
      ADD COLUMN request_fingerprint text,
      ADD COLUMN input_data jsonb,
      ADD COLUMN result_data jsonb,
      ADD COLUMN result_summary jsonb,
      ADD COLUMN result_checksum text
  `);

  const legacyRows = await client.query<LegacyCalculationRow>(`
    SELECT
      records.id,
      records.mode,
      records.method_code,
      versions.input_snapshot,
      versions.result_snapshot,
      versions.result_summary,
      versions.result_checksum
    FROM calculation_records records
    JOIN calculation_versions versions ON versions.calculation_id = records.id
    ORDER BY records.id
  `);

  for (const row of legacyRows.rows) {
    assertCanonicalObject(row.input_snapshot, "input_snapshot", row.id);
    assertCanonicalObject(row.result_snapshot, "result_snapshot", row.id);
    assertCanonicalObject(row.result_summary, "result_summary", row.id);

    const legacyResultChecksum = sha256CanonicalJson(row.result_snapshot);
    if (row.result_checksum !== legacyResultChecksum.slice("sha256:".length)) {
      throw new Error(`Legacy result checksum mismatch for calculation ${row.id}`);
    }
    const migrated = migrateLegacyNumerologyResult(row);

    await client.query(
      `UPDATE calculation_records
          SET request_fingerprint = $2,
              input_data = $3,
              result_data = $4,
              result_summary = $5,
              result_checksum = $6
        WHERE id = $1`,
      [
        row.id,
        migrated.requestFingerprint,
        migrated.inputData,
        migrated.result,
        migrated.resultSummary,
        sha256CanonicalJson(migrated.result)
      ]
    );
  }
}

function migrateLegacyNumerologyResult(row: LegacyCalculationRow): {
  readonly requestFingerprint: `sha256:${string}`;
  readonly inputData: Record<string, CanonicalJson>;
  readonly result: NumerologyResult;
  readonly resultSummary: Record<string, CanonicalJson>;
} {
  if (row.method_code !== "pythagorean") {
    throw new Error(`Unsupported legacy calculation method for ${row.id}: ${row.method_code}`);
  }
  if (row.mode !== "individual" && row.mode !== "compatibility") {
    throw new Error(`Unsupported legacy calculation mode for ${row.id}: ${row.mode}`);
  }

  const snapshot = asObject(row.input_snapshot, "input_snapshot", row.id);
  if (snapshot.methodCode !== row.method_code || snapshot.mode !== row.mode) {
    throw new Error(`Legacy input identity mismatch for calculation ${row.id}`);
  }
  if (!Array.isArray(snapshot.participants)) {
    throw new Error(`Legacy participants are missing for calculation ${row.id}`);
  }
  const expectedParticipantCount = row.mode === "individual" ? 1 : 2;
  if (snapshot.participants.length !== expectedParticipantCount) {
    throw new Error(`Legacy participant count mismatch for calculation ${row.id}`);
  }

  const participants = snapshot.participants.map((value, index) =>
    parseLegacyParticipant(value, row.id, index)
  );
  if (
    participants[0]?.role !== "subject" ||
    (row.mode === "compatibility" && participants[1]?.role !== "partner")
  ) {
    throw new Error(`Legacy participant roles are invalid for calculation ${row.id}`);
  }

  const periods = {};
  const result = numerologyResultSchema.parse(
    row.mode === "individual"
      ? calculateNumerologyIndividual({
          methodCode: "pythagorean",
          participant: participants[0]!.calculationInput,
          periods
        })
      : calculateNumerologyCompatibility({
          methodCode: "pythagorean",
          participants: {
            first: participants[0]!.calculationInput,
            second: participants[1]!.calculationInput
          },
          periods
        })
  );
  const canonicalParticipants = participants.map((participant) => ({
    role: participant.role,
    source: participant.source,
    clientId: participant.clientId,
    calculationName: participant.calculationInput.calculationName,
    calculationNameSource: participant.calculationInput.calculationNameSource,
    birthDate: participant.calculationInput.birthDate
  }));
  const inputData = toCanonicalObject({
    methodCode: "pythagorean",
    mode: row.mode,
    participants: canonicalParticipants,
    periods
  });
  const fingerprintParticipants = participants
    .map((participant) =>
      toCanonicalObject({
        source: participant.source,
        clientId: participant.clientId,
        calculationName: participant.calculationInput.calculationName,
        calculationNameSource: participant.calculationInput.calculationNameSource,
        birthDate: participant.calculationInput.birthDate
      })
    )
    .sort((first, second) => stableJson(first).localeCompare(stableJson(second)));

  return {
    requestFingerprint: sha256CanonicalJson({
      methodCode: "pythagorean",
      mode: row.mode,
      participants: fingerprintParticipants,
      periods
    }),
    inputData,
    result,
    resultSummary:
      result.mode === "individual"
        ? toCanonicalObject({ methodCode: result.methodCode, keyNumbers: result.keyNumbers })
        : toCanonicalObject({
            methodCode: result.methodCode,
            pairNumber: result.pairNumber,
            counts: result.counts,
            conclusion: result.conclusion
          })
  };
}

function parseLegacyParticipant(
  value: CanonicalJson,
  calculationId: string,
  index: number
): {
  readonly role: "subject" | "partner";
  readonly source: "crm_client" | "manual";
  readonly clientId: string | null;
  readonly calculationInput: NumerologyParticipantInput;
} {
  const participant = asObject(value, `participants[${index}]`, calculationId);
  const role = participant.role;
  const source = participant.source;
  const calculationName = participant.fullName;
  const birthDate = participant.birthDate;
  if (role !== "subject" && role !== "partner") {
    throw new Error(`Legacy participant role is invalid for calculation ${calculationId}`);
  }
  if (source !== "crm_client" && source !== "manual") {
    throw new Error(`Legacy participant source is invalid for calculation ${calculationId}`);
  }
  if (typeof calculationName !== "string" || calculationName.trim().length === 0) {
    throw new Error(`Legacy participant name is missing for calculation ${calculationId}`);
  }
  if (typeof birthDate !== "string") {
    throw new Error(`Legacy participant birth date is missing for calculation ${calculationId}`);
  }
  let clientId: string | null = null;
  if (source === "crm_client") {
    if (typeof participant.clientId !== "string") {
      throw new Error(`Legacy CRM client id is missing for calculation ${calculationId}`);
    }
    clientId = participant.clientId;
  }

  return {
    role,
    source,
    clientId,
    calculationInput: {
      calculationName,
      calculationNameSource: source === "crm_client" ? "crm_display_name" : "manual_entry",
      birthDate
    }
  };
}

function asObject(
  value: CanonicalJson,
  field: string,
  calculationId: string
): Record<string, CanonicalJson> {
  assertCanonicalObject(value, field, calculationId);
  return value as Record<string, CanonicalJson>;
}

function toCanonicalObject(value: unknown): Record<string, CanonicalJson> {
  const normalized = JSON.parse(JSON.stringify(value)) as CanonicalJson;
  if (typeof normalized !== "object" || normalized === null || Array.isArray(normalized)) {
    throw new Error("Expected a canonical JSON object during production baseline reconciliation");
  }
  return normalized as Record<string, CanonicalJson>;
}

function assertCanonicalObject(
  value: CanonicalJson,
  field: string,
  calculationId: string
): asserts value is { readonly [key: string]: CanonicalJson } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Legacy ${field} is not an object for calculation ${calculationId}`);
  }
}

async function assertCurrentSchemaShape(): Promise<void> {
  await assertPreSchedulingSchemaShape();
  if (await relationExists("public.client_birth_data")) {
    await assertClientBirthDataDstOccurrence();
  }
  for (const relation of [
    "public.availability_schedules",
    "public.availability_weekly_periods",
    "public.availability_date_overrides",
    "public.availability_override_periods",
    "public.availability_product_assignments",
    "public.schedule_reservations",
    "public.manual_calendar_blocks",
    "public.bookings",
    "public.idempotency_commands"
  ]) {
    if (!(await relationExists(relation))) {
      throw new Error(`Current production relation is missing: ${relation}`);
    }
  }

  const schedulingInvariants = await client.query<{
    exclusion_count: string;
    extension_count: string;
    product_owner_unique_count: string;
  }>(`
    SELECT
      (SELECT count(*)::text
         FROM pg_constraint
        WHERE conname = 'schedule_reservations_active_owner_range_exclude'
          AND contype = 'x') AS exclusion_count,
      (SELECT count(*)::text
         FROM pg_extension
        WHERE extname = 'btree_gist') AS extension_count,
      (SELECT count(*)::text
         FROM pg_constraint
        WHERE conname = 'products_id_owner_unique'
          AND contype = 'u') AS product_owner_unique_count
  `);
  if (
    schedulingInvariants.rows[0]?.exclusion_count !== "1" ||
    schedulingInvariants.rows[0]?.extension_count !== "1" ||
    schedulingInvariants.rows[0]?.product_owner_unique_count !== "1"
  ) {
    throw new Error("Current production schema is missing scheduling invariants");
  }
}

async function reconcileClientBirthDataDstOccurrenceIfPresent(): Promise<void> {
  if (!(await relationExists("public.client_birth_data"))) return;

  await client.query(`
    ALTER TABLE client_birth_data
      ADD COLUMN IF NOT EXISTS birth_time_dst_occurrence text;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'client_birth_data'::regclass
           AND conname = 'client_birth_data_time_dst_occurrence_check'
      ) THEN
        ALTER TABLE client_birth_data
          ADD CONSTRAINT client_birth_data_time_dst_occurrence_check
          CHECK (
            birth_time_dst_occurrence IS NULL
            OR birth_time_dst_occurrence IN ('first', 'second')
          );
      END IF;
    END
    $$;
  `);
}

async function assertClientBirthDataDstOccurrence(): Promise<void> {
  const result = await client.query<{
    column_count: string;
    constraint_count: string;
  }>(`
    SELECT
      (SELECT count(*)::text
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'client_birth_data'
          AND column_name = 'birth_time_dst_occurrence') AS column_count,
      (SELECT count(*)::text
         FROM pg_constraint
        WHERE conrelid = 'client_birth_data'::regclass
          AND conname = 'client_birth_data_time_dst_occurrence_check'
          AND contype = 'c') AS constraint_count
  `);
  if (result.rows[0]?.column_count !== "1" || result.rows[0]?.constraint_count !== "1") {
    throw new Error("Current production schema is missing client birth-data DST occurrence");
  }
}

async function assertPreSchedulingSchemaShape(): Promise<void> {
  for (const relation of [
    "public.calculation_records",
    "public.calculation_pdf_jobs",
    "public.matrix_notes",
    "public.matrix_report_drafts",
    "public.products"
  ]) {
    if (!(await relationExists(relation))) {
      throw new Error(`Previous production relation is missing: ${relation}`);
    }
  }
  if (await relationExists("public.calculation_versions")) {
    throw new Error("Legacy calculation_versions relation still exists after reconciliation");
  }

  const expectedColumns = await client.query<{ missing_count: string }>(`
    WITH required(table_name, column_name) AS (
      VALUES
        ('calculation_records', 'request_fingerprint'),
        ('calculation_records', 'input_data'),
        ('calculation_records', 'result_data'),
        ('calculation_records', 'result_summary'),
        ('calculation_records', 'result_checksum'),
        ('calculation_pdf_jobs', 'document_fingerprint')
    )
    SELECT count(*)::text AS missing_count
      FROM required
     WHERE NOT EXISTS (
       SELECT 1
         FROM information_schema.columns columns
        WHERE columns.table_schema = 'public'
          AND columns.table_name = required.table_name
          AND columns.column_name = required.column_name
     )
  `);
  if (expectedColumns.rows[0]?.missing_count !== "0") {
    throw new Error("Current production schema is missing required baseline columns");
  }
}

const legacyToCurrentDdl = `
  ALTER TABLE calculation_records
    ALTER COLUMN request_fingerprint SET NOT NULL,
    ALTER COLUMN input_data SET NOT NULL,
    ALTER COLUMN result_data SET NOT NULL,
    ALTER COLUMN result_summary SET NOT NULL,
    ALTER COLUMN result_checksum SET NOT NULL,
    DROP COLUMN current_method_version,
    ADD CONSTRAINT calculation_records_id_owner_unique UNIQUE (id, owner_user_id),
    ADD CONSTRAINT calculation_records_request_fingerprint_check CHECK (request_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
    ADD CONSTRAINT calculation_records_input_data_object_check CHECK (jsonb_typeof(input_data) = 'object'),
    ADD CONSTRAINT calculation_records_result_data_object_check CHECK (jsonb_typeof(result_data) = 'object'),
    ADD CONSTRAINT calculation_records_result_summary_object_check CHECK (jsonb_typeof(result_summary) = 'object'),
    ADD CONSTRAINT calculation_records_result_checksum_check CHECK (result_checksum ~ '^sha256:[a-f0-9]{64}$');
  CREATE UNIQUE INDEX calculation_records_exact_request_unique
    ON calculation_records (owner_user_id, module, mode, method_code, request_fingerprint);

  ALTER TABLE calculation_participants
    DROP COLUMN birth_date,
    DROP COLUMN input_snapshot,
    DROP COLUMN manually_overridden,
    ADD CONSTRAINT calculation_participants_source_client_check CHECK (
      (source = 'crm_client' AND client_id IS NOT NULL)
      OR (source = 'manual' AND client_id IS NULL)
    ),
    ADD CONSTRAINT calculation_participants_order_check CHECK ("order" >= 0 AND "order" < 2);
  CREATE INDEX calculation_participants_record_role_idx
    ON calculation_participants (calculation_id, role);

  DROP INDEX calculation_interpretations_version_idx;
  ALTER TABLE calculation_interpretations
    DROP CONSTRAINT calculation_interpretations_version_calculation_fk,
    DROP COLUMN version_id;

  DROP INDEX calculation_artifacts_version_idx;
  ALTER TABLE calculation_artifacts
    DROP CONSTRAINT calculation_artifacts_version_calculation_fk,
    DROP COLUMN version_id,
    ADD CONSTRAINT calculation_artifacts_id_calculation_unique UNIQUE (id, calculation_id);
  DROP TABLE calculation_versions;

  ALTER TABLE media_assets
    DROP CONSTRAINT media_assets_purpose_check,
    DROP CONSTRAINT media_assets_size_bytes_check,
    ADD CONSTRAINT media_assets_id_owner_unique UNIQUE (id, owner_user_id),
    ADD CONSTRAINT media_assets_purpose_check CHECK (
      purpose IN ('product_cover', 'profile_avatar', 'profile_cover', 'verification_identity_document', 'verification_qualification_document', 'calculation_report_pdf')
    ),
    ADD CONSTRAINT media_assets_size_bytes_check CHECK (size_bytes >= 0),
    ADD CONSTRAINT media_assets_ready_size_bytes_check CHECK (status <> 'ready' OR size_bytes > 0);

  CREATE TABLE calculation_pdf_jobs (
    id uuid PRIMARY KEY NOT NULL,
    calculation_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    module text NOT NULL,
    method_code text NOT NULL,
    result_checksum text NOT NULL,
    locale text NOT NULL,
    source_locator jsonb NOT NULL,
    document_fingerprint text NOT NULL,
    status text DEFAULT 'queued' NOT NULL,
    artifact_id uuid NOT NULL,
    media_asset_id uuid NOT NULL,
    failure_code text,
    failure_reason text,
    page_count integer,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT calculation_pdf_jobs_module_check CHECK (module IN ('numerology', 'chart', 'matrix', 'human_design')),
    CONSTRAINT calculation_pdf_jobs_method_code_check CHECK (length(trim(method_code)) BETWEEN 1 AND 100),
    CONSTRAINT calculation_pdf_jobs_result_checksum_check CHECK (result_checksum ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT calculation_pdf_jobs_locale_check CHECK (locale IN ('ru', 'en')),
    CONSTRAINT calculation_pdf_jobs_source_locator_object_check CHECK (jsonb_typeof(source_locator) = 'object'),
    CONSTRAINT calculation_pdf_jobs_document_fingerprint_check CHECK (document_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT calculation_pdf_jobs_status_check CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
    CONSTRAINT calculation_pdf_jobs_failure_code_check CHECK (failure_code IS NULL OR length(trim(failure_code)) BETWEEN 1 AND 100),
    CONSTRAINT calculation_pdf_jobs_failure_reason_check CHECK (failure_reason IS NULL OR length(trim(failure_reason)) BETWEEN 1 AND 500),
    CONSTRAINT calculation_pdf_jobs_page_count_check CHECK (page_count IS NULL OR page_count > 0),
    CONSTRAINT calculation_pdf_jobs_calculation_owner_fk FOREIGN KEY (calculation_id, owner_user_id)
      REFERENCES calculation_records(id, owner_user_id) ON DELETE CASCADE,
    CONSTRAINT calculation_pdf_jobs_artifact_id_fk FOREIGN KEY (artifact_id, calculation_id)
      REFERENCES calculation_artifacts(id, calculation_id) ON DELETE CASCADE,
    CONSTRAINT calculation_pdf_jobs_media_asset_id_fk FOREIGN KEY (media_asset_id, owner_user_id)
      REFERENCES media_assets(id, owner_user_id) ON DELETE RESTRICT
  );
  CREATE UNIQUE INDEX calculation_pdf_jobs_idempotency_unique
    ON calculation_pdf_jobs (owner_user_id, calculation_id, result_checksum, locale, document_fingerprint)
    WHERE status <> 'failed';
  CREATE INDEX calculation_pdf_jobs_owner_calculation_locale_created_idx
    ON calculation_pdf_jobs (owner_user_id, calculation_id, locale, created_at, id);
  CREATE INDEX calculation_pdf_jobs_status_updated_idx
    ON calculation_pdf_jobs (status, updated_at);

  CREATE TABLE matrix_notes (
    id uuid PRIMARY KEY NOT NULL,
    calculation_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    text text NOT NULL,
    result_checksum text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT matrix_notes_text_length_check CHECK (length(trim(text)) BETWEEN 1 AND 10000),
    CONSTRAINT matrix_notes_result_checksum_check CHECK (result_checksum ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT matrix_notes_calculation_owner_fk FOREIGN KEY (calculation_id, owner_user_id)
      REFERENCES calculation_records(id, owner_user_id) ON DELETE CASCADE
  );
  CREATE INDEX matrix_notes_owner_calculation_created_id_idx
    ON matrix_notes (owner_user_id, calculation_id, created_at, id);

  CREATE TABLE matrix_report_drafts (
    id uuid PRIMARY KEY NOT NULL,
    calculation_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    source text NOT NULL,
    status text NOT NULL,
    locale text NOT NULL,
    content jsonb NOT NULL,
    plain_text text NOT NULL,
    result_checksum text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    model_id text,
    prompt_version text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT matrix_report_drafts_calculation_unique UNIQUE (calculation_id),
    CONSTRAINT matrix_report_drafts_identity_unique UNIQUE (id, calculation_id, owner_user_id),
    CONSTRAINT matrix_report_drafts_source_check CHECK (source IN ('manual', 'ai')),
    CONSTRAINT matrix_report_drafts_status_check CHECK (status IN ('draft', 'ready')),
    CONSTRAINT matrix_report_drafts_locale_check CHECK (locale IN ('ru', 'en')),
    CONSTRAINT matrix_report_drafts_content_object_check CHECK (jsonb_typeof(content) = 'object'),
    CONSTRAINT matrix_report_drafts_plain_text_length_check CHECK (length(trim(plain_text)) BETWEEN 1 AND 50000),
    CONSTRAINT matrix_report_drafts_result_checksum_check CHECK (result_checksum ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT matrix_report_drafts_revision_check CHECK (revision > 0),
    CONSTRAINT matrix_report_drafts_calculation_owner_fk FOREIGN KEY (calculation_id, owner_user_id)
      REFERENCES calculation_records(id, owner_user_id) ON DELETE CASCADE
  );
  CREATE INDEX matrix_report_drafts_owner_calculation_idx
    ON matrix_report_drafts (owner_user_id, calculation_id);
`;
