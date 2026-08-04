import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { calculationRecords } from "./calculation-records.schema";
import {
  chartCalculationJobMethodValues,
  chartInterpretationModeValues,
  chartCalculationJobProviderValues,
  chartCalculationJobSchemaVersionValues,
  chartCalculationJobStatusValues,
  formatCalculationSqlValues
} from "./calculation-values";

export const chartCalculationJobs = pgTable(
  "chart_calculation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    resultCalculationId: uuid("result_calculation_id"),
    targetCalculationId: uuid("target_calculation_id"),
    expectedSourceChecksum: text("expected_source_checksum"),
    method: text("method").notNull().default("natal"),
    interpretationMode: text("interpretation_mode"),
    methodVersion: text("method_version"),
    status: text("status").notNull().default("queued"),
    inputFingerprint: text("input_fingerprint").notNull(),
    inputSnapshot: jsonb("input_snapshot").notNull(),
    settingsSnapshot: jsonb("settings_snapshot").notNull(),
    participantSnapshot: jsonb("participant_snapshot").notNull(),
    provider: text("provider").notNull().default("kerykeion"),
    schemaVersion: text("schema_version").notNull().default("chart-result.v2"),
    executionProfile: jsonb("execution_profile"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lockedBy: text("locked_by"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    leaseGeneration: integer("lease_generation").notNull().default(0),
    resultChecksum: text("result_checksum"),
    resultReproducibilityFingerprint: text("result_reproducibility_fingerprint"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "chart_calculation_jobs_method_check",
      sql`${table.method} in ${sql.raw(formatCalculationSqlValues(chartCalculationJobMethodValues))}`
    ),
    check(
      "chart_calculation_jobs_interpretation_mode_check",
      sql`${table.interpretationMode} is null or (
        ${table.interpretationMode} in ${sql.raw(
          formatCalculationSqlValues(chartInterpretationModeValues)
        )}
        and (
          ${table.method} = 'natal'
          or ${table.interpretationMode} = 'legacy_unclassified'
        )
      )`
    ),
    check(
      "chart_calculation_jobs_status_check",
      sql`${table.status} in ${sql.raw(formatCalculationSqlValues(chartCalculationJobStatusValues))}`
    ),
    check(
      "chart_calculation_jobs_provider_check",
      sql`${table.provider} in ${sql.raw(formatCalculationSqlValues(chartCalculationJobProviderValues))}`
    ),
    check(
      "chart_calculation_jobs_schema_version_check",
      sql`${table.schemaVersion} in ${sql.raw(formatCalculationSqlValues(chartCalculationJobSchemaVersionValues))}`
    ),
    check(
      "chart_calculation_jobs_input_fingerprint_check",
      sql`${table.inputFingerprint} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "chart_calculation_jobs_input_snapshot_object_check",
      sql`jsonb_typeof(${table.inputSnapshot}) = 'object'`
    ),
    check(
      "chart_calculation_jobs_settings_snapshot_object_check",
      sql`jsonb_typeof(${table.settingsSnapshot}) = 'object'`
    ),
    check(
      "chart_calculation_jobs_participant_snapshot_check",
      sql`coalesce((
        jsonb_typeof(${table.participantSnapshot}) = 'array'
        and (
          (
            ${table.method} in ('synastry', 'composite')
            and jsonb_array_length(${table.participantSnapshot}) = 2
            and ${table.participantSnapshot}->0 = jsonb_build_object(
              'role', 'subject', 'clientId', ${table.clientId}
            )
            and ${table.participantSnapshot}->1->>'role' = 'partner'
            and ${table.participantSnapshot}->1 = jsonb_build_object(
              'role', 'partner', 'clientId', ${table.participantSnapshot}->1->>'clientId'
            )
            and ${table.participantSnapshot}->1->>'clientId'
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and ${table.participantSnapshot}->1->>'clientId' <> ${table.clientId}::text
          )
          or (
            ${table.method} not in ('synastry', 'composite')
            and ${table.participantSnapshot} = jsonb_build_array(
              jsonb_build_object('role', 'subject', 'clientId', ${table.clientId})
            )
          )
        )
      ), false)`
    ),
    check(
      "chart_calculation_jobs_replacement_pair_check",
      sql`(${table.targetCalculationId} is null) = (${table.expectedSourceChecksum} is null)`
    ),
    check(
      "chart_calculation_jobs_expected_source_checksum_check",
      sql`${table.expectedSourceChecksum} is null or ${table.expectedSourceChecksum} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "chart_calculation_jobs_method_version_check",
      sql`coalesce((
        (
          ${table.schemaVersion} = 'chart-result.v1'
          and ${table.methodVersion} is null
          and ${table.executionProfile} is null
          and ${table.resultReproducibilityFingerprint} is null
        )
        or (
          ${table.schemaVersion} = 'chart-result.v2'
          and ${table.executionProfile} is not null
          and ${table.methodVersion} = case ${table.method}
            when 'natal' then 'chart.natal.kerykeion-5.12.v2'
            when 'astrocartography' then 'chart.astrocartography.swisseph.v2'
            when 'transit' then 'chart.transit.kerykeion-5.12.v2'
            when 'synastry' then 'chart.synastry.kerykeion-5.12.v2'
            when 'composite' then 'chart.composite.kerykeion-5.12.v2'
            when 'solar_return' then 'chart.solar-return.kerykeion-5.12.v2'
            when 'progression' then 'chart.progression.secondary-tropical-year.v2'
            when 'horary' then 'chart.horary.kerykeion-5.12.v2'
          end
        )
      ), false)`
    ),
    check(
      "chart_calculation_jobs_execution_profile_object_check",
      sql`coalesce((
        ${table.executionProfile} is null
        or (
          jsonb_typeof(${table.executionProfile}) = 'object'
          and ${table.executionProfile} = jsonb_build_object(
            'provider', ${table.executionProfile}->'provider',
            'kerykeionVersion', ${table.executionProfile}->'kerykeionVersion',
            'pyswissephVersion', ${table.executionProfile}->'pyswissephVersion',
            'expectedEphemeris', ${table.executionProfile}->'expectedEphemeris',
            'expectedEphemerisFlags', ${table.executionProfile}->'expectedEphemerisFlags',
            'expectedEphemerisDataRevision', ${table.executionProfile}->'expectedEphemerisDataRevision'
          )
          and ${table.executionProfile}->>'provider' = 'kerykeion'
          and ${table.executionProfile}->>'kerykeionVersion' = '5.12.9'
          and ${table.executionProfile}->>'pyswissephVersion' = '2.10.3.2'
          and (
            (
              ${table.executionProfile}->>'expectedEphemeris' = 'moshier'
              and ${table.executionProfile}->'expectedEphemerisFlags' in (
                '["FLG_MOSEPH", "FLG_SPEED"]'::jsonb,
                '["FLG_SPEED", "FLG_MOSEPH"]'::jsonb
              )
              and ${table.executionProfile}->'expectedEphemerisDataRevision' = 'null'::jsonb
            )
            or (
              ${table.executionProfile}->>'expectedEphemeris' = 'swiss-ephemeris'
              and ${table.executionProfile}->'expectedEphemerisFlags' in (
                '["FLG_SWIEPH", "FLG_SPEED"]'::jsonb,
                '["FLG_SPEED", "FLG_SWIEPH"]'::jsonb
              )
              and ${table.executionProfile}->>'expectedEphemerisDataRevision'
                ~ '^sha256:[a-f0-9]{64}$'
            )
          )
        )
      ), false)`
    ),
    check("chart_calculation_jobs_attempts_check", sql`${table.attempts} >= 0`),
    check("chart_calculation_jobs_max_attempts_check", sql`${table.maxAttempts} > 0`),
    check(
      "chart_calculation_jobs_attempts_limit_check",
      sql`${table.attempts} <= ${table.maxAttempts}`
    ),
    check("chart_calculation_jobs_lease_generation_check", sql`${table.leaseGeneration} >= 0`),
    check(
      "chart_calculation_jobs_result_checksum_check",
      sql`${table.resultChecksum} is null or ${table.resultChecksum} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "chart_calculation_jobs_result_reproducibility_fingerprint_check",
      sql`${table.resultReproducibilityFingerprint} is null or ${table.resultReproducibilityFingerprint} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "chart_calculation_jobs_lease_state_check",
      sql`coalesce((
        (
          ${table.status} = 'queued'
          and ${table.lockedBy} is null
          and ${table.lockedUntil} is null
          and ${table.finishedAt} is null
          and ${table.resultCalculationId} is null
          and ${table.resultChecksum} is null
          and ${table.resultReproducibilityFingerprint} is null
          and (
            (${table.lastErrorCode} is null and ${table.lastErrorMessage} is null)
            or (
              length(trim(${table.lastErrorCode})) > 0
              and length(trim(${table.lastErrorMessage})) > 0
            )
          )
        )
        or (
          ${table.status} = 'processing'
          and length(trim(${table.lockedBy})) > 0
          and ${table.lockedUntil} is not null
          and ${table.leaseGeneration} > 0
          and ${table.startedAt} is not null
          and ${table.finishedAt} is null
          and ${table.resultCalculationId} is null
          and ${table.resultChecksum} is null
          and ${table.resultReproducibilityFingerprint} is null
          and ${table.lastErrorCode} is null
          and ${table.lastErrorMessage} is null
        )
        or (
          ${table.status} = 'succeeded'
          and ${table.lockedBy} is null
          and ${table.lockedUntil} is null
          and ${table.startedAt} is not null
          and ${table.finishedAt} is not null
          and ${table.resultCalculationId} is not null
          and (
            ${table.schemaVersion} = 'chart-result.v1'
            or (
              ${table.resultChecksum} is not null
              and ${table.resultReproducibilityFingerprint} is not null
            )
          )
          and ${table.lastErrorCode} is null
          and ${table.lastErrorMessage} is null
        )
        or (
          ${table.status} = 'failed'
          and ${table.lockedBy} is null
          and ${table.lockedUntil} is null
          and ${table.startedAt} is not null
          and ${table.finishedAt} is not null
          and ${table.resultCalculationId} is null
          and ${table.resultChecksum} is null
          and ${table.resultReproducibilityFingerprint} is null
          and length(trim(${table.lastErrorCode})) > 0
          and length(trim(${table.lastErrorMessage})) > 0
        )
      ), false)`
    ),
    foreignKey({
      name: "chart_calculation_jobs_result_owner_fk",
      columns: [table.resultCalculationId, table.ownerUserId],
      foreignColumns: [calculationRecords.id, calculationRecords.ownerUserId]
    }).onDelete("restrict"),
    foreignKey({
      name: "chart_calculation_jobs_target_owner_fk",
      columns: [table.targetCalculationId, table.ownerUserId],
      foreignColumns: [calculationRecords.id, calculationRecords.ownerUserId]
    }).onDelete("restrict"),
    index("chart_calculation_jobs_owner_idx").on(table.ownerUserId),
    index("chart_calculation_jobs_client_idx").on(table.clientId),
    index("chart_calculation_jobs_status_updated_idx").on(table.status, table.updatedAt),
    uniqueIndex("chart_calculation_jobs_active_fingerprint_unique")
      .on(table.ownerUserId, table.inputFingerprint)
      .where(sql`${table.status} in ('queued', 'processing')`)
  ]
);
