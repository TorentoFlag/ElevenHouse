import { createHash } from "node:crypto";
import type { Client } from "pg";
import {
  assertStoredChartCalculationIntegrity,
  canonicalizeChartExecutionProfile
} from "@elevenhouse/domain";
import { chartJobResultChecksumGuardDdl } from "./augment-chart-jobs-baseline";

type ChartJobCatalogFingerprint = {
  readonly hash: string;
  readonly columns: number;
  readonly constraints: number;
  readonly indexes: number;
  readonly unvalidatedConstraints: number;
  readonly invalidIndexes: number;
  readonly integrityHash: string;
  readonly triggers: number;
  readonly functions: number;
  readonly disabledTriggers: number;
};

type ChartJobIntegrityCatalogFingerprint = Pick<
  ChartJobCatalogFingerprint,
  "integrityHash" | "triggers" | "functions" | "disabledTriggers"
>;

const emptyChartJobIntegrityCatalog = fingerprintChartJobIntegrityCatalog([], []);
const canonicalChartJobIntegrityCatalog = fingerprintChartJobIntegrityCatalog(
  [
    `chart_calculation_jobs.chart_calculation_jobs_result_checksum_immutable|${normalizeCatalogDefinition(
      "CREATE TRIGGER chart_calculation_jobs_result_checksum_immutable BEFORE UPDATE OF result_checksum ON public.chart_calculation_jobs FOR EACH ROW EXECUTE FUNCTION elevenhouse_guard_chart_job_result_checksum_mutation()"
    )}|enabled=O`
  ],
  [
    `public.elevenhouse_guard_chart_job_result_checksum_mutation()|kind=f|language=plpgsql|result=trigger|securityDefiner=false|volatility=v|parallel=u|strict=false|leakproof=false|config=[]|source=${normalizeFunctionSource(
      extractCanonicalChartJobGuardSource()
    )}`
  ]
);

const currentChartJobCatalog = {
  hash: "4872baa8f377712c403aac662c31231f0224d42a39d4a1f1a1ecd16ec38b69f6",
  columns: 30,
  constraints: 25,
  indexes: 5,
  unvalidatedConstraints: 0,
  invalidIndexes: 0,
  ...canonicalChartJobIntegrityCatalog
} as const satisfies ChartJobCatalogFingerprint;

const predecessorInterpretationModeChartJobCatalog = {
  hash: "6dde3481ed4d23fbc4c95eef0180cb31595eb737131efd9a3d5297b02778bb88",
  columns: 29,
  constraints: 24,
  indexes: 5,
  unvalidatedConstraints: 0,
  invalidIndexes: 0,
  ...canonicalChartJobIntegrityCatalog
} as const satisfies ChartJobCatalogFingerprint;

const predecessorResultChecksumChartJobCatalog = {
  hash: "1c7fc342c64ce1c15f44d6e834d3e3b2d12032cb6992a2f4ca4b08378d3bff3c",
  columns: 28,
  constraints: 23,
  indexes: 5,
  unvalidatedConstraints: 0,
  invalidIndexes: 0,
  ...emptyChartJobIntegrityCatalog
} as const satisfies ChartJobCatalogFingerprint;

const absentChartJobCatalog = {
  hash: "3582a05442a0df42b0ca65d8d38cf15793160dcde64e9d84599352bfba407ab4",
  columns: 0,
  constraints: 0,
  indexes: 0,
  unvalidatedConstraints: 0,
  invalidIndexes: 0,
  ...emptyChartJobIntegrityCatalog
} as const satisfies ChartJobCatalogFingerprint;

const legacyChartJobCatalogHashes = new Set([
  "59e09fe5b86c9b0f58d11cc8d677051c201ede8980a9965ec402f395a609f966",
  "d1f2feed28f8dd8fb3fe2226b6eb6952afb9148b61169230594709fff2a1f542",
  "dcd89a525d1c70df216ebf73516626a032bdc367290864b0a41c39e49c436ec9",
  "4f67c2fdafb7d4ff879c6bdf00be3470ff85a0b767430c54fdbc1371cc066c29",
  "528065e382958226647e8eddd9091046912de60920e892ebe4d0edc267874f3a",
  "a5ed87d27c4a656fdaedb9133120a5403fe73dd8ca83c83bd875a71e4e4008f3",
  "e93334b49aca3a3874cadd51a492f53b4993ecee53d021fb284da2733fa8d5b7",
  "31d605f4608deb4a75acb97e881a65ca6282499caee4ddb49639d72c37c52ea1"
]);

export async function reconcileChartCalculationJobsIfPrerequisitesExist(
  client: Client
): Promise<void> {
  const catalog = await readChartJobCatalog(client);
  const prerequisiteState = await readChartJobPrerequisiteState(client);

  if (prerequisiteState === "absent") {
    if (!matchesChartJobCatalog(catalog, absentChartJobCatalog)) {
      throw new Error(
        "Refusing to reconcile chart calculation jobs without owner-safe calculation prerequisites"
      );
    }
    return;
  }

  await reconcileCalculationIdentityCatalog(client);

  if (matchesChartJobCatalog(catalog, currentChartJobCatalog)) {
    return;
  }

  if (matchesChartJobCatalog(catalog, predecessorInterpretationModeChartJobCatalog)) {
    await migratePredecessorChartJobInterpretationMode(client);
    await assertChartCalculationJobs(client);
    return;
  }

  if (matchesChartJobCatalog(catalog, predecessorResultChecksumChartJobCatalog)) {
    await migratePredecessorChartJobResultChecksums(client);
    await migratePredecessorChartJobInterpretationMode(client);
    await assertChartCalculationJobs(client);
    return;
  }

  if (matchesChartJobCatalog(catalog, absentChartJobCatalog)) {
    await queryChartMigrationDdl(
      client,
      "create chart calculation jobs table",
      createChartCalculationJobsTableDdl
    );
    await finalizeChartCalculationJobsSchema(client);
    await assertChartCalculationJobs(client);
    return;
  }

  if (isLegacyChartJobCatalog(catalog)) {
    await migrateLegacyChartCalculationJobs(client);
    await assertChartCalculationJobs(client);
    return;
  }

  throw new Error(
    `Refusing to reconcile a partial or drifted chart calculation jobs catalog: ${formatChartJobCatalog(catalog)}`
  );
}

export async function assertChartCalculationJobs(client: Client): Promise<void> {
  const prerequisiteState = await readChartJobPrerequisiteState(client);
  const actual = await readChartJobCatalog(client);
  if (prerequisiteState === "absent") {
    if (matchesChartJobCatalog(actual, absentChartJobCatalog)) return;
    throw new Error(
      "Current chart calculation jobs exist without owner-safe calculation prerequisites"
    );
  }

  await assertCalculationIdentityCatalog(client);
  if (matchesChartJobCatalog(actual, currentChartJobCatalog)) {
    return;
  }
  throw new Error(
    `Current chart calculation jobs catalog drifted; expected=${formatChartJobCatalog(currentChartJobCatalog)} actual=${formatChartJobCatalog(actual)}`
  );
}

async function readChartJobPrerequisiteState(client: Client): Promise<"absent" | "current"> {
  const result = await client.query<{
    users_relation: string | null;
    calculations_relation: string | null;
    participants_relation: string | null;
    owner_column_count: string;
    owner_unique_count: string;
  }>(`
    SELECT
      to_regclass('public.users')::text AS users_relation,
      to_regclass('public.calculation_records')::text AS calculations_relation,
      to_regclass('public.calculation_participants')::text AS participants_relation,
      (SELECT count(*)::text
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'calculation_records'
          AND column_name = 'owner_user_id') AS owner_column_count,
      (SELECT count(*)::text
         FROM pg_constraint
        WHERE conrelid = to_regclass('public.calculation_records')
          AND conname = 'calculation_records_id_owner_unique'
          AND contype = 'u'
          AND convalidated) AS owner_unique_count
  `);
  const row = result.rows[0];
  if (
    row?.calculations_relation === null &&
    row.participants_relation === null &&
    row.owner_column_count === "0" &&
    row.owner_unique_count === "0"
  ) {
    return "absent";
  }
  if (
    row?.users_relation === "users" &&
    row.calculations_relation === "calculation_records" &&
    row.participants_relation === "calculation_participants" &&
    row.owner_column_count === "1" &&
    row.owner_unique_count === "1"
  ) {
    return "current";
  }
  throw new Error(
    `Refusing to reconcile partial or drifted chart calculation job prerequisites: ${JSON.stringify(row ?? null)}`
  );
}

async function reconcileCalculationIdentityCatalog(client: Client): Promise<void> {
  const catalog = await readCalculationIdentityCatalog(client);
  if (matchesCatalogEntries(catalog, currentCalculationIdentityCatalog)) return;
  if (
    !legacyCalculationIdentityCatalogs.some((expected) => matchesCatalogEntries(catalog, expected))
  ) {
    throw new Error(
      `Refusing to reconcile a partial or drifted calculation identity catalog: ${JSON.stringify(catalog)}`
    );
  }

  await client.query(
    "LOCK TABLE calculation_records, calculation_participants IN ACCESS EXCLUSIVE MODE"
  );
  const lockedCatalog = await readCalculationIdentityCatalog(client);
  if (
    !legacyCalculationIdentityCatalogs.some((expected) =>
      matchesCatalogEntries(lockedCatalog, expected)
    )
  ) {
    throw new Error(
      `Legacy calculation identity catalog changed before reconciliation: ${JSON.stringify(lockedCatalog)}`
    );
  }

  const duplicate = await client.query<{
    calculation_id: string;
    duplicate_kind: string;
  }>(`
    SELECT calculation_id::text, 'role'::text AS duplicate_kind
      FROM calculation_participants
     GROUP BY calculation_id, role
    HAVING count(*) > 1
    UNION ALL
    SELECT calculation_id::text, 'order'::text AS duplicate_kind
      FROM calculation_participants
     GROUP BY calculation_id, "order"
    HAVING count(*) > 1
     ORDER BY calculation_id, duplicate_kind
     LIMIT 1
  `);
  const duplicateRow = duplicate.rows[0];
  if (duplicateRow) {
    throw new Error(
      `Cannot prove calculation participant identity uniqueness: ${duplicateRow.calculation_id}:${duplicateRow.duplicate_kind}`
    );
  }

  await queryChartMigrationDdl(
    client,
    "install current calculation identity catalog",
    `
      DROP INDEX calculation_records_exact_request_unique;
      CREATE UNIQUE INDEX calculation_records_exact_request_unique
        ON calculation_records (
          owner_user_id, module, mode, method_code, request_fingerprint
        )
        WHERE status <> 'archived';

      DROP INDEX calculation_participants_record_role_idx;
      DROP INDEX IF EXISTS calculation_participants_record_order_idx;
      ALTER TABLE calculation_participants
        ADD CONSTRAINT calculation_participants_record_role_unique
          UNIQUE (calculation_id, role),
        ADD CONSTRAINT calculation_participants_record_order_unique
          UNIQUE (calculation_id, "order");
    `
  );
  await assertCalculationIdentityCatalog(client);
}

async function assertCalculationIdentityCatalog(client: Client): Promise<void> {
  const catalog = await readCalculationIdentityCatalog(client);
  if (matchesCatalogEntries(catalog, currentCalculationIdentityCatalog)) return;
  throw new Error(`Current calculation identity catalog drifted: ${JSON.stringify(catalog)}`);
}

async function readCalculationIdentityCatalog(client: Client): Promise<readonly string[]> {
  const constraints = await client.query<{
    relation_name: string;
    object_name: string;
    definition: string;
    validated: boolean;
  }>(`
    SELECT
      relation.relname AS relation_name,
      constraint_record.conname AS object_name,
      pg_get_constraintdef(constraint_record.oid, false) AS definition,
      constraint_record.convalidated AS validated
    FROM pg_constraint AS constraint_record
    JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'calculation_participants'
      AND constraint_record.conname IN (
        'calculation_participants_record_role_unique',
        'calculation_participants_record_order_unique'
      )
  `);
  const indexes = await client.query<{
    relation_name: string;
    object_name: string;
    definition: string;
    valid: boolean;
    ready: boolean;
  }>(`
    SELECT
      index_catalog.tablename AS relation_name,
      index_catalog.indexname AS object_name,
      index_catalog.indexdef AS definition,
      index_record.indisvalid AS valid,
      index_record.indisready AS ready
    FROM pg_indexes AS index_catalog
    JOIN pg_class AS relation
      ON relation.relname = index_catalog.tablename
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = index_catalog.schemaname
    JOIN pg_class AS index_relation
      ON index_relation.relname = index_catalog.indexname
     AND index_relation.relnamespace = namespace.oid
    JOIN pg_index AS index_record
      ON index_record.indexrelid = index_relation.oid
     AND index_record.indrelid = relation.oid
    WHERE index_catalog.schemaname = 'public'
      AND index_catalog.indexname IN (
        'calculation_records_exact_request_unique',
        'calculation_participants_record_role_idx',
        'calculation_participants_record_order_idx',
        'calculation_participants_record_role_unique',
        'calculation_participants_record_order_unique'
      )
  `);

  return [
    ...constraints.rows.map(
      (row) =>
        `constraint.${row.relation_name}.${row.object_name}|${normalizeCatalogDefinition(row.definition)}|validated=${row.validated}`
    ),
    ...indexes.rows.map(
      (row) =>
        `index.${row.relation_name}.${row.object_name}|${normalizeCatalogDefinition(row.definition)}|valid=${row.valid}|ready=${row.ready}`
    )
  ].sort();
}

function matchesCatalogEntries(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((entry, index) => entry === expected[index])
  );
}

const currentCalculationIdentityCatalog = [
  "constraint.calculation_participants.calculation_participants_record_order_unique|unique (calculation_id, order)|validated=true",
  "constraint.calculation_participants.calculation_participants_record_role_unique|unique (calculation_id, role)|validated=true",
  "index.calculation_participants.calculation_participants_record_order_unique|create unique index calculation_participants_record_order_unique on public.calculation_participants using btree (calculation_id, order)|valid=true|ready=true",
  "index.calculation_participants.calculation_participants_record_role_unique|create unique index calculation_participants_record_role_unique on public.calculation_participants using btree (calculation_id, role)|valid=true|ready=true",
  "index.calculation_records.calculation_records_exact_request_unique|create unique index calculation_records_exact_request_unique on public.calculation_records using btree (owner_user_id, module, mode, method_code, request_fingerprint) where (status <> 'archived'::text)|valid=true|ready=true"
] as const;

const legacyCalculationRecordIndex =
  "index.calculation_records.calculation_records_exact_request_unique|create unique index calculation_records_exact_request_unique on public.calculation_records using btree (owner_user_id, module, mode, method_code, request_fingerprint)|valid=true|ready=true";
const legacyCalculationParticipantRoleIndex =
  "index.calculation_participants.calculation_participants_record_role_idx|create index calculation_participants_record_role_idx on public.calculation_participants using btree (calculation_id, role)|valid=true|ready=true";
const legacyCalculationParticipantOrderIndex =
  "index.calculation_participants.calculation_participants_record_order_idx|create index calculation_participants_record_order_idx on public.calculation_participants using btree (calculation_id, order)|valid=true|ready=true";
const legacyCalculationIdentityCatalogs = [
  [
    legacyCalculationParticipantOrderIndex,
    legacyCalculationParticipantRoleIndex,
    legacyCalculationRecordIndex
  ].sort(),
  [legacyCalculationParticipantRoleIndex, legacyCalculationRecordIndex].sort()
] as const;

async function migratePredecessorChartJobResultChecksums(client: Client): Promise<void> {
  await client.query(
    "LOCK TABLE chart_calculation_jobs, calculation_records IN ACCESS EXCLUSIVE MODE"
  );
  const lockedCatalog = await readChartJobCatalog(client);
  if (!matchesChartJobCatalog(lockedCatalog, predecessorResultChecksumChartJobCatalog)) {
    throw new Error(
      `Predecessor chart calculation jobs catalog changed before reconciliation: ${formatChartJobCatalog(lockedCatalog)}`
    );
  }

  const histories = await client.query<{
    job_id: string;
    owner_matches: boolean | null;
    module: string | null;
    calculation_method_code: string | null;
    method_matches: boolean | null;
    mode_matches: boolean | null;
    request_matches: boolean | null;
    input_matches: boolean | null;
    participants_match: boolean | null;
    calculation_status: string | null;
    calculation_checksum: string | null;
    calculation_input_data: unknown;
    result_data: unknown;
    job_method_version: string | null;
    job_execution_profile: unknown;
    job_result_reproducibility_fingerprint: string | null;
    history_count: string;
  }>(`
    SELECT
      job.id::text AS job_id,
      calculation.owner_user_id = job.owner_user_id AS owner_matches,
      calculation.module,
      calculation.method_code AS calculation_method_code,
      calculation.method_code = job.method AS method_matches,
      calculation.mode = CASE
        WHEN job.method IN ('synastry', 'composite') THEN 'compatibility'
        ELSE 'individual'
      END AS mode_matches,
      calculation.request_fingerprint = job.input_fingerprint AS request_matches,
      calculation.input_data = jsonb_build_object(
        'inputSnapshot', job.input_snapshot,
        'settings', job.settings_snapshot
      ) AS input_matches,
      (
        SELECT
          count(*) = jsonb_array_length(job.participant_snapshot)
          AND coalesce(bool_and(
            participant.source = 'crm_client'
            AND participant.client_id IS NOT NULL
            AND length(trim(participant.display_name)) > 0
          ), false)
          AND coalesce(jsonb_agg(
            jsonb_build_object(
              'role', participant.role,
              'clientId', participant.client_id
            )
            ORDER BY participant."order"
          ), '[]'::jsonb) = job.participant_snapshot
        FROM calculation_participants AS participant
        WHERE participant.calculation_id = job.result_calculation_id
      ) AS participants_match,
      calculation.status AS calculation_status,
      calculation.result_checksum AS calculation_checksum,
      calculation.input_data AS calculation_input_data,
      calculation.result_data,
      job.method_version AS job_method_version,
      job.execution_profile AS job_execution_profile,
      job.result_reproducibility_fingerprint AS job_result_reproducibility_fingerprint,
      (
        SELECT count(*)::text
          FROM chart_calculation_jobs AS historical_job
         WHERE historical_job.schema_version = 'chart-result.v2'
           AND historical_job.status = 'succeeded'
           AND historical_job.result_calculation_id = job.result_calculation_id
      ) AS history_count
    FROM chart_calculation_jobs AS job
    LEFT JOIN calculation_records AS calculation
      ON calculation.id = job.result_calculation_id
    WHERE job.schema_version = 'chart-result.v2'
      AND job.status = 'succeeded'
    ORDER BY job.id
  `);
  for (const history of histories.rows) {
    if (history.history_count !== "1") {
      throw new Error(
        `Cannot recover immutable chart job checksum from multiple succeeded histories: ${history.job_id}`
      );
    }
    let resultIntegrityMatches = false;
    try {
      if (history.calculation_checksum !== null) {
        const result = assertStoredChartCalculationIntegrity({
          calculation: {
            module: history.module ?? "",
            methodCode: history.calculation_method_code ?? "",
            inputData: history.calculation_input_data,
            resultData: history.result_data,
            resultChecksum: history.calculation_checksum
          },
          expectedExecutionProfile: canonicalizeChartExecutionProfile(history.job_execution_profile)
        });
        resultIntegrityMatches =
          result.schemaVersion === "chart-result.v2" &&
          result.methodVersion === history.job_method_version &&
          result.reproducibilityFingerprint === history.job_result_reproducibility_fingerprint;
      }
    } catch {
      resultIntegrityMatches = false;
    }
    if (
      history.owner_matches !== true ||
      history.module !== "chart" ||
      history.method_matches !== true ||
      history.mode_matches !== true ||
      history.request_matches !== true ||
      history.input_matches !== true ||
      history.participants_match !== true ||
      history.calculation_status === null ||
      history.calculation_status === "archived" ||
      !resultIntegrityMatches
    ) {
      throw new Error(`Cannot prove historical chart job result checksum: ${history.job_id}`);
    }
  }

  await queryChartMigrationDdl(
    client,
    "backfill immutable chart job result checksums",
    predecessorChartJobResultChecksumDdl
  );
  await queryChartMigrationDdl(
    client,
    "install immutable chart job result checksum guard",
    chartJobResultChecksumGuardDdl
  );
}

async function migratePredecessorChartJobInterpretationMode(client: Client): Promise<void> {
  await client.query("LOCK TABLE chart_calculation_jobs IN ACCESS EXCLUSIVE MODE");
  const lockedCatalog = await readChartJobCatalog(client);
  if (!matchesChartJobCatalog(lockedCatalog, predecessorInterpretationModeChartJobCatalog)) {
    throw new Error(
      `Predecessor chart calculation jobs interpretation catalog changed before reconciliation: ${formatChartJobCatalog(lockedCatalog)}`
    );
  }

  await queryChartMigrationDdl(
    client,
    "install chart calculation job interpretation authority",
    chartJobInterpretationModeDdl
  );
}

async function migrateLegacyChartCalculationJobs(client: Client): Promise<void> {
  await client.query("LOCK TABLE chart_calculation_jobs IN ACCESS EXCLUSIVE MODE");
  const lockedCatalog = await readChartJobCatalog(client);
  if (!isLegacyChartJobCatalog(lockedCatalog)) {
    throw new Error(
      `Legacy chart calculation jobs catalog changed before reconciliation: ${formatChartJobCatalog(lockedCatalog)}`
    );
  }

  await backfillSafeLegacySucceededSubjectParticipants(client);
  await assertLegacyChartJobData(client);
  await assertLegacySucceededRelationshipIdentity(client);
  await queryChartMigrationDdl(
    client,
    "backfill legacy chart job identity",
    `
    ALTER TABLE chart_calculation_jobs
      ADD COLUMN target_calculation_id uuid,
      ADD COLUMN expected_source_checksum text,
      ADD COLUMN interpretation_mode text,
      ADD COLUMN method_version text,
      ADD COLUMN participant_snapshot jsonb,
      ADD COLUMN execution_profile jsonb,
      ADD COLUMN lease_generation integer,
      ADD COLUMN result_reproducibility_fingerprint text,
      ADD COLUMN result_checksum text;

    UPDATE chart_calculation_jobs AS job
       SET participant_snapshot = CASE
         WHEN job.status = 'succeeded'
          AND job.method IN ('synastry', 'composite')
         THEN jsonb_build_array(
           jsonb_build_object('role', 'subject', 'clientId', job.client_id),
           jsonb_build_object(
             'role',
             'partner',
             'clientId',
             (job.input_snapshot #>> '{relationshipSnapshot,partnerClientId}')::uuid
           )
         )
         WHEN job.status = 'succeeded' THEN (
           SELECT jsonb_agg(
             jsonb_build_object('role', participant.role, 'clientId', participant.client_id)
             ORDER BY participant."order"
           )
             FROM calculation_participants AS participant
            WHERE participant.calculation_id = job.result_calculation_id
              AND participant.source = 'crm_client'
              AND participant.client_id IS NOT NULL
         )
         WHEN job.method IN ('synastry', 'composite')
          AND jsonb_typeof(job.input_snapshot->'relationshipSnapshot') = 'object'
          AND (job.input_snapshot->'relationshipSnapshot')
                ?& ARRAY['primaryClientId', 'partnerClientId']::text[]
          AND (job.input_snapshot->'relationshipSnapshot')
                - ARRAY['primaryClientId', 'partnerClientId']::text[] = '{}'::jsonb
          AND CASE
            WHEN lower(job.input_snapshot #>> '{relationshipSnapshot,primaryClientId}')
                   ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             AND lower(job.input_snapshot #>> '{relationshipSnapshot,partnerClientId}')
                   ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (job.input_snapshot #>> '{relationshipSnapshot,primaryClientId}')::uuid =
                   job.client_id
             AND (job.input_snapshot #>> '{relationshipSnapshot,partnerClientId}')::uuid <>
                   job.client_id
             AND EXISTS (
               SELECT 1
                 FROM users AS partner_user
                WHERE partner_user.id = (
                  job.input_snapshot #>> '{relationshipSnapshot,partnerClientId}'
                )::uuid
             )
            ELSE false
          END
         THEN jsonb_build_array(
           jsonb_build_object('role', 'subject', 'clientId', job.client_id),
           jsonb_build_object(
             'role',
             'partner',
             'clientId',
             (job.input_snapshot #>> '{relationshipSnapshot,partnerClientId}')::uuid
           )
         )
         WHEN job.method NOT IN ('synastry', 'composite') THEN jsonb_build_array(
           jsonb_build_object('role', 'subject', 'clientId', job.client_id)
         )
         ELSE NULL
       END,
       lease_generation = 0;
  `
  );

  await assertLegacyParticipantBackfill(client);
  await queryChartMigrationDdl(
    client,
    "terminalize active legacy chart jobs",
    `
    UPDATE chart_calculation_jobs
       SET status = 'failed',
           locked_by = NULL,
           locked_until = NULL,
           started_at = coalesce(started_at, transaction_timestamp()),
           finished_at = transaction_timestamp(),
           last_error_code = 'legacy_job_requires_requeue',
           last_error_message =
             'Legacy chart job requires explicit requeue under chart-result.v2',
           updated_at = transaction_timestamp()
     WHERE status IN ('queued', 'processing');
  `
  );
  await queryChartMigrationDdl(
    client,
    "redact legacy chart job failure details",
    `
    UPDATE chart_calculation_jobs
       SET last_error_code = 'legacy_job_requires_requeue',
           last_error_message =
             'Legacy chart job requires explicit requeue under chart-result.v2'
     WHERE status = 'failed';
  `
  );

  await assertLegacyTerminalState(client);
  await queryChartMigrationDdl(
    client,
    "drop legacy chart calculation jobs catalog",
    dropLegacyChartCalculationJobsSchemaDdl
  );
  await finalizeChartCalculationJobsSchema(client);
}

/**
 * Early chart jobs predate calculation_participants. A succeeded individual
 * chart can be repaired only if its own immutable snapshots already match the
 * stored calculation, and the owned CRM relationship provides a non-empty
 * display-name snapshot. Relationship charts are deliberately excluded: they
 * require two independently provable participants.
 */
async function backfillSafeLegacySucceededSubjectParticipants(client: Client): Promise<void> {
  await client.query(`
    INSERT INTO calculation_participants (
      calculation_id, role, source, client_id, display_name, "order"
    )
    SELECT
      job.result_calculation_id,
      'subject',
      'crm_client',
      job.client_id,
      profile.display_name_snapshot,
      0
    FROM chart_calculation_jobs AS job
    JOIN calculation_records AS calculation
      ON calculation.id = job.result_calculation_id
    JOIN client_profiles AS profile
      ON profile.user_id = job.client_id
    JOIN client_astrologer_relationships AS relationship
      ON relationship.client_user_id = job.client_id
     AND relationship.astrologer_user_id = job.owner_user_id
     AND relationship.status = 'active'
    WHERE job.schema_version = 'chart-result.v1'
      AND job.status = 'succeeded'
      AND job.method NOT IN ('synastry', 'composite')
      AND calculation.owner_user_id = job.owner_user_id
      AND calculation.module = 'chart'
      AND calculation.mode = 'individual'
      AND calculation.method_code = job.method
      AND calculation.status = 'calculated'
      AND calculation.request_fingerprint = job.input_fingerprint
      AND calculation.input_data = jsonb_build_object(
        'inputSnapshot', job.input_snapshot,
        'settings', job.settings_snapshot
      )
      AND calculation.result_data->>'schemaVersion' = 'chart-result.v1'
      AND calculation.result_data->>'method' = job.method
      AND length(trim(profile.display_name_snapshot)) BETWEEN 1 AND 200
      AND NOT EXISTS (
        SELECT 1
        FROM calculation_participants AS participant
        WHERE participant.calculation_id = job.result_calculation_id
      )
  `);
}

async function assertLegacyChartJobData(client: Client): Promise<void> {
  const result = await client.query<{ id: string }>(`
    SELECT job.id
      FROM chart_calculation_jobs AS job
      LEFT JOIN calculation_records AS calculation
        ON calculation.id = job.result_calculation_id
     WHERE job.schema_version <> 'chart-result.v1'
        OR job.attempts > job.max_attempts
        OR (
          job.result_calculation_id IS NOT NULL
          AND (
            calculation.id IS NULL
            OR calculation.owner_user_id <> job.owner_user_id
          )
        )
        OR (
          job.status = 'succeeded'
          AND (
            job.result_calculation_id IS NULL
            OR calculation.module IS DISTINCT FROM 'chart'
            OR calculation.mode IS DISTINCT FROM 'individual'
            OR calculation.method_code IS DISTINCT FROM job.method
            OR calculation.status IS DISTINCT FROM 'calculated'
            OR calculation.request_fingerprint IS DISTINCT FROM job.input_fingerprint
            OR calculation.input_data IS DISTINCT FROM jsonb_build_object(
              'inputSnapshot', job.input_snapshot,
              'settings', job.settings_snapshot
            )
            OR calculation.result_data->>'schemaVersion' IS DISTINCT FROM 'chart-result.v1'
            OR calculation.result_data->>'method' IS DISTINCT FROM job.method
            OR (
              SELECT count(*)
                FROM calculation_participants AS participant
               WHERE participant.calculation_id = job.result_calculation_id
            ) <> 1
            OR NOT EXISTS (
              SELECT 1
                FROM calculation_participants AS participant
               WHERE participant.calculation_id = job.result_calculation_id
                 AND participant.role = 'subject'
                 AND participant.source = 'crm_client'
                 AND participant.client_id = job.client_id
                 AND length(trim(participant.display_name)) > 0
                 AND participant."order" = 0
            )
            OR job.started_at IS NULL
            OR job.finished_at IS NULL
            OR job.locked_by IS NOT NULL
            OR job.locked_until IS NOT NULL
            OR job.last_error_code IS NOT NULL
            OR job.last_error_message IS NOT NULL
          )
        )
        OR (
          job.status = 'failed'
          AND (
            job.result_calculation_id IS NOT NULL
            OR job.started_at IS NULL
            OR job.finished_at IS NULL
            OR job.locked_by IS NOT NULL
            OR job.locked_until IS NOT NULL
            OR length(trim(job.last_error_code)) = 0
            OR length(trim(job.last_error_message)) = 0
          )
        )
        OR (
          job.status IN ('queued', 'processing')
          AND job.result_calculation_id IS NOT NULL
        )
     ORDER BY job.id
     LIMIT 1
  `);
  const invalidId = result.rows[0]?.id;
  if (invalidId) {
    throw new Error(`Legacy chart job state cannot be reconciled safely: ${invalidId}`);
  }
}

async function assertLegacySucceededRelationshipIdentity(client: Client): Promise<void> {
  const result = await client.query<{ id: string }>(`
    SELECT job.id
      FROM chart_calculation_jobs AS job
      JOIN calculation_records AS calculation
        ON calculation.id = job.result_calculation_id
     WHERE job.status = 'succeeded'
       AND job.method IN ('synastry', 'composite')
       AND NOT coalesce((
         jsonb_typeof(job.input_snapshot->'relationshipSnapshot') = 'object'
         AND (job.input_snapshot->'relationshipSnapshot')
               ?& ARRAY['primaryClientId', 'partnerClientId']::text[]
         AND (job.input_snapshot->'relationshipSnapshot')
               - ARRAY['primaryClientId', 'partnerClientId']::text[] = '{}'::jsonb
         AND jsonb_typeof(calculation.result_data->'relationshipSnapshot') = 'object'
         AND (calculation.result_data->'relationshipSnapshot')
               ?& ARRAY['primaryClientId', 'partnerClientId']::text[]
         AND (calculation.result_data->'relationshipSnapshot')
               - ARRAY['primaryClientId', 'partnerClientId']::text[] = '{}'::jsonb
         AND calculation.result_data->'relationshipSnapshot' =
               job.input_snapshot->'relationshipSnapshot'
         AND CASE
           WHEN lower(job.input_snapshot #>> '{relationshipSnapshot,primaryClientId}')
                  ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            AND lower(job.input_snapshot #>> '{relationshipSnapshot,partnerClientId}')
                  ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           THEN (job.input_snapshot #>> '{relationshipSnapshot,primaryClientId}')::uuid =
                  job.client_id
            AND (job.input_snapshot #>> '{relationshipSnapshot,partnerClientId}')::uuid <>
                  job.client_id
            AND EXISTS (
              SELECT 1
                FROM users AS partner_user
               WHERE partner_user.id = (
                 job.input_snapshot #>> '{relationshipSnapshot,partnerClientId}'
               )::uuid
            )
           ELSE false
         END
       ), false)
     ORDER BY job.id
     LIMIT 1
  `);
  const invalidId = result.rows[0]?.id;
  if (invalidId) {
    throw new Error(`Cannot prove succeeded legacy chart relationship identity: ${invalidId}`);
  }
}

async function assertLegacyParticipantBackfill(client: Client): Promise<void> {
  const result = await client.query<{ id: string }>(`
    SELECT job.id
      FROM chart_calculation_jobs AS job
     WHERE NOT coalesce((
       jsonb_typeof(job.participant_snapshot) = 'array'
       AND (
         (
           job.method IN ('synastry', 'composite')
           AND jsonb_array_length(job.participant_snapshot) = 2
           AND job.participant_snapshot->0 = jsonb_build_object(
             'role', 'subject', 'clientId', job.client_id
           )
           AND job.participant_snapshot->1->>'role' = 'partner'
           AND job.participant_snapshot->1 = jsonb_build_object(
             'role', 'partner', 'clientId', job.participant_snapshot->1->>'clientId'
           )
           AND job.participant_snapshot->1->>'clientId'
                 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           AND job.participant_snapshot->1->>'clientId' <> job.client_id::text
         )
         OR (
           job.method NOT IN ('synastry', 'composite')
           AND job.participant_snapshot = jsonb_build_array(
             jsonb_build_object('role', 'subject', 'clientId', job.client_id)
           )
         )
       )
     ), false)
        OR EXISTS (
          SELECT 1
            FROM jsonb_array_elements(job.participant_snapshot) AS participant(value)
            LEFT JOIN users AS participant_user
              ON participant_user.id = CASE
                WHEN participant.value->>'clientId'
                       ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                THEN (participant.value->>'clientId')::uuid
                ELSE NULL
              END
           WHERE participant_user.id IS NULL
        )
     ORDER BY job.id
     LIMIT 1
  `);
  const invalidId = result.rows[0]?.id;
  if (invalidId) {
    throw new Error(`Cannot prove legacy chart job participants: ${invalidId}`);
  }
}

async function assertLegacyTerminalState(client: Client): Promise<void> {
  const result = await client.query<{ id: string }>(`
    SELECT id
      FROM chart_calculation_jobs
     WHERE participant_snapshot IS NULL
        OR lease_generation IS NULL
        OR attempts > max_attempts
        OR (
          status = 'succeeded'
          AND (
            started_at IS NULL
            OR finished_at IS NULL
            OR result_calculation_id IS NULL
            OR locked_by IS NOT NULL
            OR locked_until IS NOT NULL
            OR last_error_code IS NOT NULL
            OR last_error_message IS NOT NULL
          )
        )
        OR (
          status = 'failed'
          AND (
            started_at IS NULL
            OR finished_at IS NULL
            OR result_calculation_id IS NOT NULL
            OR locked_by IS NOT NULL
            OR locked_until IS NOT NULL
            OR last_error_code IS DISTINCT FROM 'legacy_job_requires_requeue'
            OR last_error_message IS DISTINCT FROM
                 'Legacy chart job requires explicit requeue under chart-result.v2'
          )
        )
     ORDER BY id
     LIMIT 1
  `);
  const invalidId = result.rows[0]?.id;
  if (invalidId) {
    throw new Error(`Legacy chart job terminal state cannot be reconciled safely: ${invalidId}`);
  }
}

async function finalizeChartCalculationJobsSchema(client: Client): Promise<void> {
  await queryChartMigrationDdl(
    client,
    "install current chart calculation jobs catalog",
    finalizeChartCalculationJobsSchemaDdl
  );
}

async function queryChartMigrationDdl(
  client: Client,
  label: string,
  statement: string
): Promise<void> {
  try {
    await client.query(statement);
  } catch (error) {
    const failure = error as { message?: string; detail?: string; position?: string };
    throw new Error(
      `${label} failed: ${failure.message ?? "unknown PostgreSQL error"}` +
        `${failure.detail ? `; detail=${failure.detail}` : ""}` +
        `${failure.position ? `; position=${failure.position}` : ""}`,
      { cause: error }
    );
  }
}

async function readChartJobCatalog(client: Client): Promise<ChartJobCatalogFingerprint> {
  const columns = await client.query<{
    table_name: string;
    column_name: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
  }>(`
    SELECT table_name, column_name, udt_name, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'chart_calculation_jobs'
  `);
  const constraints = await client.query<{
    relation_name: string;
    object_name: string;
    definition: string;
    validated: boolean;
  }>(`
    SELECT
      relation.relname AS relation_name,
      constraint_record.conname AS object_name,
      pg_get_constraintdef(constraint_record.oid, false) AS definition,
      constraint_record.convalidated AS validated
    FROM pg_constraint AS constraint_record
    JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'chart_calculation_jobs'
      AND constraint_record.contype <> 't'
  `);
  const indexes = await client.query<{
    relation_name: string;
    object_name: string;
    definition: string;
    valid: boolean;
    ready: boolean;
  }>(`
    SELECT
      index_catalog.tablename AS relation_name,
      index_catalog.indexname AS object_name,
      index_catalog.indexdef AS definition,
      index_record.indisvalid AS valid,
      index_record.indisready AS ready
    FROM pg_indexes AS index_catalog
    JOIN pg_class AS relation
      ON relation.relname = index_catalog.tablename
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = index_catalog.schemaname
    JOIN pg_class AS index_relation
      ON index_relation.relname = index_catalog.indexname
     AND index_relation.relnamespace = namespace.oid
    JOIN pg_index AS index_record
      ON index_record.indexrelid = index_relation.oid
     AND index_record.indrelid = relation.oid
    WHERE index_catalog.schemaname = 'public'
      AND index_catalog.tablename = 'chart_calculation_jobs'
  `);
  const triggers = await client.query<{
    relation_name: string;
    object_name: string;
    definition: string;
    enabled: string;
  }>(`
    SELECT
      relation.relname AS relation_name,
      trigger_record.tgname AS object_name,
      pg_get_triggerdef(trigger_record.oid, false) AS definition,
      trigger_record.tgenabled AS enabled
    FROM pg_trigger AS trigger_record
    JOIN pg_class AS relation ON relation.oid = trigger_record.tgrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'chart_calculation_jobs'
      AND NOT trigger_record.tgisinternal
  `);
  const functions = await client.query<{
    function_schema: string;
    function_name: string;
    identity_arguments: string;
    function_kind: string;
    language_name: string;
    result_type: string;
    security_definer: boolean;
    volatility: string;
    parallel: string;
    strict: boolean;
    leakproof: boolean;
    configuration: readonly string[] | null;
    source: string;
  }>(`
    WITH chart_trigger_functions AS (
      SELECT DISTINCT trigger_record.tgfoid AS function_oid
        FROM pg_trigger AS trigger_record
       WHERE trigger_record.tgrelid = to_regclass('public.chart_calculation_jobs')
         AND NOT trigger_record.tgisinternal
    ),
    chart_integrity_functions AS (
      SELECT function_oid FROM chart_trigger_functions
      UNION
      SELECT function_record.oid
        FROM pg_proc AS function_record
        JOIN pg_namespace AS namespace ON namespace.oid = function_record.pronamespace
       WHERE namespace.nspname = 'public'
         AND function_record.proname = 'elevenhouse_guard_chart_job_result_checksum_mutation'
    )
    SELECT
      namespace.nspname AS function_schema,
      function_record.proname AS function_name,
      pg_get_function_identity_arguments(function_record.oid) AS identity_arguments,
      function_record.prokind::text AS function_kind,
      language.lanname AS language_name,
      pg_get_function_result(function_record.oid) AS result_type,
      function_record.prosecdef AS security_definer,
      function_record.provolatile::text AS volatility,
      function_record.proparallel::text AS parallel,
      function_record.proisstrict AS strict,
      function_record.proleakproof AS leakproof,
      function_record.proconfig AS configuration,
      function_record.prosrc AS source
    FROM chart_integrity_functions AS owned
    JOIN pg_proc AS function_record ON function_record.oid = owned.function_oid
    JOIN pg_namespace AS namespace ON namespace.oid = function_record.pronamespace
    JOIN pg_language AS language ON language.oid = function_record.prolang
  `);

  const payload = {
    columns: columns.rows
      .map(
        (row) =>
          `${row.table_name}.${row.column_name}|${row.udt_name}|${row.is_nullable}|${row.column_default ?? ""}`
      )
      .sort(),
    constraints: constraints.rows
      .map(
        (row) =>
          `${row.relation_name}.${row.object_name}|${normalizeCatalogDefinition(row.definition)}`
      )
      .sort(),
    indexes: indexes.rows
      .map(
        (row) =>
          `${row.relation_name}.${row.object_name}|${normalizeCatalogDefinition(row.definition)}`
      )
      .sort()
  };
  const integrity = fingerprintChartJobIntegrityCatalog(
    triggers.rows.map(
      (row) =>
        `${row.relation_name}.${row.object_name}|${normalizeCatalogDefinition(row.definition)}|enabled=${row.enabled}`
    ),
    functions.rows.map(
      (row) =>
        `${row.function_schema}.${row.function_name}(${row.identity_arguments})|kind=${row.function_kind}|language=${row.language_name}|result=${row.result_type}|securityDefiner=${row.security_definer}|volatility=${row.volatility}|parallel=${row.parallel}|strict=${row.strict}|leakproof=${row.leakproof}|config=${JSON.stringify(row.configuration ?? [])}|source=${normalizeFunctionSource(row.source)}`
    )
  );

  return {
    hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    columns: payload.columns.length,
    constraints: payload.constraints.length,
    indexes: payload.indexes.length,
    unvalidatedConstraints: constraints.rows.filter((row) => !row.validated).length,
    invalidIndexes: indexes.rows.filter((row) => !row.valid || !row.ready).length,
    ...integrity
  };
}

function isLegacyChartJobCatalog(catalog: ChartJobCatalogFingerprint): boolean {
  return (
    catalog.columns === 21 &&
    catalog.constraints === 13 &&
    catalog.indexes === 6 &&
    catalog.unvalidatedConstraints === 0 &&
    catalog.invalidIndexes === 0 &&
    matchesChartJobIntegrityCatalog(catalog, emptyChartJobIntegrityCatalog) &&
    legacyChartJobCatalogHashes.has(catalog.hash)
  );
}

function matchesChartJobCatalog(
  actual: ChartJobCatalogFingerprint,
  expected: ChartJobCatalogFingerprint
): boolean {
  return (
    actual.hash === expected.hash &&
    actual.columns === expected.columns &&
    actual.constraints === expected.constraints &&
    actual.indexes === expected.indexes &&
    actual.unvalidatedConstraints === expected.unvalidatedConstraints &&
    actual.invalidIndexes === expected.invalidIndexes &&
    matchesChartJobIntegrityCatalog(actual, expected)
  );
}

function matchesChartJobIntegrityCatalog(
  actual: ChartJobIntegrityCatalogFingerprint,
  expected: ChartJobIntegrityCatalogFingerprint
): boolean {
  return (
    actual.integrityHash === expected.integrityHash &&
    actual.triggers === expected.triggers &&
    actual.functions === expected.functions &&
    actual.disabledTriggers === expected.disabledTriggers
  );
}

function formatChartJobCatalog(catalog: ChartJobCatalogFingerprint): string {
  return `${catalog.hash}[columns=${catalog.columns},constraints=${catalog.constraints},indexes=${catalog.indexes},unvalidated=${catalog.unvalidatedConstraints},invalidIndexes=${catalog.invalidIndexes},integrity=${catalog.integrityHash},triggers=${catalog.triggers},functions=${catalog.functions},disabledTriggers=${catalog.disabledTriggers}]`;
}

function normalizeCatalogDefinition(value: string): string {
  return value.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeFunctionSource(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function fingerprintChartJobIntegrityCatalog(
  triggerEntries: readonly string[],
  functionEntries: readonly string[]
): ChartJobIntegrityCatalogFingerprint {
  const triggers = [...triggerEntries].sort();
  const functions = [...functionEntries].sort();
  return {
    integrityHash: createHash("sha256")
      .update(JSON.stringify({ triggers, functions }))
      .digest("hex"),
    triggers: triggers.length,
    functions: functions.length,
    disabledTriggers: triggers.filter((entry) => !entry.endsWith("|enabled=O")).length
  };
}

function extractCanonicalChartJobGuardSource(): string {
  const delimiter = "$chart_job_result_checksum_guard$";
  const start = chartJobResultChecksumGuardDdl.indexOf(delimiter);
  const end = chartJobResultChecksumGuardDdl.lastIndexOf(delimiter);
  if (start < 0 || end <= start) {
    throw new Error("Canonical chart job result checksum guard source is unavailable");
  }
  return chartJobResultChecksumGuardDdl.slice(start + delimiter.length, end);
}

const createChartCalculationJobsTableDdl = `
  CREATE TABLE chart_calculation_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    result_calculation_id uuid,
    target_calculation_id uuid,
    expected_source_checksum text,
    method text DEFAULT 'natal' NOT NULL,
    interpretation_mode text,
    method_version text,
    status text DEFAULT 'queued' NOT NULL,
    input_fingerprint text NOT NULL,
    input_snapshot jsonb NOT NULL,
    settings_snapshot jsonb NOT NULL,
    participant_snapshot jsonb,
    provider text DEFAULT 'kerykeion' NOT NULL,
    schema_version text DEFAULT 'chart-result.v2' NOT NULL,
    execution_profile jsonb,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    locked_by text,
    locked_until timestamptz,
    lease_generation integer,
    result_reproducibility_fingerprint text,
    result_checksum text,
    last_error_code text,
    last_error_message text,
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
  );
`;

const dropLegacyChartCalculationJobsSchemaDdl = `
  ALTER TABLE chart_calculation_jobs
    DROP CONSTRAINT chart_calculation_jobs_owner_user_id_users_id_fk,
    DROP CONSTRAINT chart_calculation_jobs_client_id_client_profiles_user_id_fk,
    DROP CONSTRAINT chart_calculation_jobs_result_calculation_id_calculation_record,
    DROP CONSTRAINT chart_calculation_jobs_method_check,
    DROP CONSTRAINT chart_calculation_jobs_status_check,
    DROP CONSTRAINT chart_calculation_jobs_provider_check,
    DROP CONSTRAINT chart_calculation_jobs_schema_version_check,
    DROP CONSTRAINT chart_calculation_jobs_input_fingerprint_check,
    DROP CONSTRAINT chart_calculation_jobs_input_snapshot_object_check,
    DROP CONSTRAINT chart_calculation_jobs_settings_snapshot_object_check,
    DROP CONSTRAINT chart_calculation_jobs_attempts_check,
    DROP CONSTRAINT chart_calculation_jobs_max_attempts_check;
  DROP INDEX chart_calculation_jobs_owner_idx;
  DROP INDEX chart_calculation_jobs_client_idx;
  DROP INDEX chart_calculation_jobs_status_updated_idx;
  DROP INDEX chart_calculation_jobs_active_fingerprint_unique;
  DROP INDEX chart_calculation_jobs_success_fingerprint_unique;
`;

const finalizeChartCalculationJobsSchemaDdl = `
  ALTER TABLE chart_calculation_jobs
    ALTER COLUMN participant_snapshot SET NOT NULL,
    ALTER COLUMN lease_generation SET DEFAULT 0,
    ALTER COLUMN lease_generation SET NOT NULL,
    ALTER COLUMN schema_version SET DEFAULT 'chart-result.v2';

  ALTER TABLE chart_calculation_jobs
    ADD CONSTRAINT chart_calculation_jobs_method_check CHECK (
      method IN (
        'natal', 'astrocartography', 'transit', 'synastry', 'composite',
        'solar_return', 'progression', 'horary'
      )
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_interpretation_mode_check CHECK (
      interpretation_mode IS NULL OR (
        interpretation_mode IN ('adult_natal', 'child', 'legacy_unclassified')
        AND (
          method = 'natal'
          OR interpretation_mode = 'legacy_unclassified'
        )
      )
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_status_check CHECK (
      status IN ('queued', 'processing', 'succeeded', 'failed')
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_provider_check CHECK (
      provider IN ('kerykeion')
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_schema_version_check CHECK (
      schema_version IN ('chart-result.v1', 'chart-result.v2')
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_input_fingerprint_check CHECK (
      input_fingerprint ~ '^sha256:[a-f0-9]{64}$'
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_input_snapshot_object_check CHECK (
      jsonb_typeof(input_snapshot) = 'object'
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_settings_snapshot_object_check CHECK (
      jsonb_typeof(settings_snapshot) = 'object'
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_participant_snapshot_check CHECK (coalesce((
      jsonb_typeof(participant_snapshot) = 'array'
      AND (
        (
          method IN ('synastry', 'composite')
          AND jsonb_array_length(participant_snapshot) = 2
          AND participant_snapshot->0 = jsonb_build_object(
            'role', 'subject', 'clientId', client_id
          )
          AND participant_snapshot->1->>'role' = 'partner'
          AND participant_snapshot->1 = jsonb_build_object(
            'role', 'partner', 'clientId', participant_snapshot->1->>'clientId'
          )
          AND participant_snapshot->1->>'clientId'
                ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND participant_snapshot->1->>'clientId' <> client_id::text
        )
        OR (
          method NOT IN ('synastry', 'composite')
          AND participant_snapshot = jsonb_build_array(
            jsonb_build_object('role', 'subject', 'clientId', client_id)
          )
        )
      )
    ), false)) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_replacement_pair_check CHECK (
      (target_calculation_id IS NULL) = (expected_source_checksum IS NULL)
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_expected_source_checksum_check CHECK (
      expected_source_checksum IS NULL
      OR expected_source_checksum ~ '^sha256:[a-f0-9]{64}$'
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_method_version_check CHECK (coalesce((
      (
        schema_version = 'chart-result.v1'
        AND method_version IS NULL
        AND execution_profile IS NULL
        AND result_reproducibility_fingerprint IS NULL
      )
      OR (
        schema_version = 'chart-result.v2'
        AND execution_profile IS NOT NULL
        AND method_version = CASE method
          WHEN 'natal' THEN 'chart.natal.kerykeion-5.12.v2'
          WHEN 'astrocartography' THEN 'chart.astrocartography.swisseph.v2'
          WHEN 'transit' THEN 'chart.transit.kerykeion-5.12.v2'
          WHEN 'synastry' THEN 'chart.synastry.kerykeion-5.12.v2'
          WHEN 'composite' THEN 'chart.composite.kerykeion-5.12.v2'
          WHEN 'solar_return' THEN 'chart.solar-return.kerykeion-5.12.v2'
          WHEN 'progression' THEN 'chart.progression.secondary-tropical-year.v2'
          WHEN 'horary' THEN 'chart.horary.kerykeion-5.12.v2'
        END
      )
    ), false)) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_execution_profile_object_check CHECK (coalesce((
      execution_profile IS NULL
      OR (
        jsonb_typeof(execution_profile) = 'object'
        AND execution_profile = jsonb_build_object(
          'provider', execution_profile->'provider',
          'kerykeionVersion', execution_profile->'kerykeionVersion',
          'pyswissephVersion', execution_profile->'pyswissephVersion',
          'expectedEphemeris', execution_profile->'expectedEphemeris',
          'expectedEphemerisFlags', execution_profile->'expectedEphemerisFlags',
          'expectedEphemerisDataRevision', execution_profile->'expectedEphemerisDataRevision'
        )
        AND execution_profile->>'provider' = 'kerykeion'
        AND execution_profile->>'kerykeionVersion' = '5.12.9'
        AND execution_profile->>'pyswissephVersion' = '2.10.3.2'
        AND (
          (
            execution_profile->>'expectedEphemeris' = 'moshier'
            AND execution_profile->'expectedEphemerisFlags' IN (
              '["FLG_MOSEPH", "FLG_SPEED"]'::jsonb,
              '["FLG_SPEED", "FLG_MOSEPH"]'::jsonb
            )
            AND execution_profile->'expectedEphemerisDataRevision' = 'null'::jsonb
          )
          OR (
            execution_profile->>'expectedEphemeris' = 'swiss-ephemeris'
            AND execution_profile->'expectedEphemerisFlags' IN (
              '["FLG_SWIEPH", "FLG_SPEED"]'::jsonb,
              '["FLG_SPEED", "FLG_SWIEPH"]'::jsonb
            )
            AND execution_profile->>'expectedEphemerisDataRevision'
                  ~ '^sha256:[a-f0-9]{64}$'
          )
        )
      )
    ), false)) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_attempts_check CHECK (attempts >= 0) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_max_attempts_check CHECK (max_attempts > 0) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_attempts_limit_check CHECK (
      attempts <= max_attempts
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_lease_generation_check CHECK (
      lease_generation >= 0
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_result_checksum_check CHECK (
      result_checksum IS NULL
      OR result_checksum ~ '^sha256:[a-f0-9]{64}$'
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_result_reproducibility_fingerprint_check CHECK (
      result_reproducibility_fingerprint IS NULL
      OR result_reproducibility_fingerprint ~ '^sha256:[a-f0-9]{64}$'
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_lease_state_check CHECK (coalesce((
      (
        status = 'queued'
        AND locked_by IS NULL
        AND locked_until IS NULL
        AND finished_at IS NULL
        AND result_calculation_id IS NULL
        AND result_checksum IS NULL
        AND result_reproducibility_fingerprint IS NULL
        AND (
          (last_error_code IS NULL AND last_error_message IS NULL)
          OR (
            length(trim(last_error_code)) > 0
            AND length(trim(last_error_message)) > 0
          )
        )
      )
      OR (
        status = 'processing'
        AND length(trim(locked_by)) > 0
        AND locked_until IS NOT NULL
        AND lease_generation > 0
        AND started_at IS NOT NULL
        AND finished_at IS NULL
        AND result_calculation_id IS NULL
        AND result_checksum IS NULL
        AND result_reproducibility_fingerprint IS NULL
        AND last_error_code IS NULL
        AND last_error_message IS NULL
      )
      OR (
        status = 'succeeded'
        AND locked_by IS NULL
        AND locked_until IS NULL
        AND started_at IS NOT NULL
        AND finished_at IS NOT NULL
        AND result_calculation_id IS NOT NULL
        AND (
          schema_version = 'chart-result.v1'
          OR (
            result_checksum IS NOT NULL
            AND result_reproducibility_fingerprint IS NOT NULL
          )
        )
        AND last_error_code IS NULL
        AND last_error_message IS NULL
      )
      OR (
        status = 'failed'
        AND locked_by IS NULL
        AND locked_until IS NULL
        AND started_at IS NOT NULL
        AND finished_at IS NOT NULL
        AND result_calculation_id IS NULL
        AND result_checksum IS NULL
        AND result_reproducibility_fingerprint IS NULL
        AND length(trim(last_error_code)) > 0
        AND length(trim(last_error_message)) > 0
      )
    ), false)) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_client_id_users_id_fk
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_result_owner_fk
      FOREIGN KEY (result_calculation_id, owner_user_id)
      REFERENCES calculation_records(id, owner_user_id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_target_owner_fk
      FOREIGN KEY (target_calculation_id, owner_user_id)
      REFERENCES calculation_records(id, owner_user_id) ON DELETE RESTRICT NOT VALID;

  ALTER TABLE chart_calculation_jobs
    VALIDATE CONSTRAINT chart_calculation_jobs_method_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_interpretation_mode_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_status_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_provider_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_schema_version_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_input_fingerprint_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_input_snapshot_object_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_settings_snapshot_object_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_participant_snapshot_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_replacement_pair_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_expected_source_checksum_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_method_version_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_execution_profile_object_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_attempts_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_max_attempts_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_attempts_limit_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_lease_generation_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_result_checksum_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_result_reproducibility_fingerprint_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_lease_state_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_owner_user_id_users_id_fk,
    VALIDATE CONSTRAINT chart_calculation_jobs_client_id_users_id_fk,
    VALIDATE CONSTRAINT chart_calculation_jobs_result_owner_fk,
    VALIDATE CONSTRAINT chart_calculation_jobs_target_owner_fk;

  CREATE INDEX chart_calculation_jobs_owner_idx
    ON chart_calculation_jobs (owner_user_id);
  CREATE INDEX chart_calculation_jobs_client_idx
    ON chart_calculation_jobs (client_id);
  CREATE INDEX chart_calculation_jobs_status_updated_idx
    ON chart_calculation_jobs (status, updated_at);
  CREATE UNIQUE INDEX chart_calculation_jobs_active_fingerprint_unique
    ON chart_calculation_jobs (owner_user_id, input_fingerprint)
    WHERE status IN ('queued', 'processing');

  ${chartJobResultChecksumGuardDdl}
`;

const predecessorChartJobResultChecksumDdl = `
  ALTER TABLE chart_calculation_jobs
    ADD COLUMN result_checksum text;

  UPDATE chart_calculation_jobs AS job
     SET result_checksum = calculation.result_checksum
    FROM calculation_records AS calculation
   WHERE job.schema_version = 'chart-result.v2'
     AND job.status = 'succeeded'
     AND calculation.id = job.result_calculation_id;

  ALTER TABLE chart_calculation_jobs
    DROP CONSTRAINT chart_calculation_jobs_lease_state_check,
    ADD CONSTRAINT chart_calculation_jobs_result_checksum_check CHECK (
      result_checksum IS NULL
      OR result_checksum ~ '^sha256:[a-f0-9]{64}$'
    ) NOT VALID,
    ADD CONSTRAINT chart_calculation_jobs_lease_state_check CHECK (coalesce((
      (
        status = 'queued'
        AND locked_by IS NULL
        AND locked_until IS NULL
        AND finished_at IS NULL
        AND result_calculation_id IS NULL
        AND result_checksum IS NULL
        AND result_reproducibility_fingerprint IS NULL
        AND (
          (last_error_code IS NULL AND last_error_message IS NULL)
          OR (
            length(trim(last_error_code)) > 0
            AND length(trim(last_error_message)) > 0
          )
        )
      )
      OR (
        status = 'processing'
        AND length(trim(locked_by)) > 0
        AND locked_until IS NOT NULL
        AND lease_generation > 0
        AND started_at IS NOT NULL
        AND finished_at IS NULL
        AND result_calculation_id IS NULL
        AND result_checksum IS NULL
        AND result_reproducibility_fingerprint IS NULL
        AND last_error_code IS NULL
        AND last_error_message IS NULL
      )
      OR (
        status = 'succeeded'
        AND locked_by IS NULL
        AND locked_until IS NULL
        AND started_at IS NOT NULL
        AND finished_at IS NOT NULL
        AND result_calculation_id IS NOT NULL
        AND (
          schema_version = 'chart-result.v1'
          OR (
            result_checksum IS NOT NULL
            AND result_reproducibility_fingerprint IS NOT NULL
          )
        )
        AND last_error_code IS NULL
        AND last_error_message IS NULL
      )
      OR (
        status = 'failed'
        AND locked_by IS NULL
        AND locked_until IS NULL
        AND started_at IS NOT NULL
        AND finished_at IS NOT NULL
        AND result_calculation_id IS NULL
        AND result_checksum IS NULL
        AND result_reproducibility_fingerprint IS NULL
        AND length(trim(last_error_code)) > 0
        AND length(trim(last_error_message)) > 0
      )
    ), false)) NOT VALID;

  ALTER TABLE chart_calculation_jobs
    VALIDATE CONSTRAINT chart_calculation_jobs_result_checksum_check,
    VALIDATE CONSTRAINT chart_calculation_jobs_lease_state_check;
`;

const chartJobInterpretationModeDdl = `
  ALTER TABLE chart_calculation_jobs
    ADD COLUMN interpretation_mode text,
    ADD CONSTRAINT chart_calculation_jobs_interpretation_mode_check CHECK (
      interpretation_mode IS NULL OR (
        interpretation_mode IN ('adult_natal', 'child', 'legacy_unclassified')
        AND (
          method = 'natal'
          OR interpretation_mode = 'legacy_unclassified'
        )
      )
    ) NOT VALID;
  ALTER TABLE chart_calculation_jobs
    VALIDATE CONSTRAINT chart_calculation_jobs_interpretation_mode_check;
`;
