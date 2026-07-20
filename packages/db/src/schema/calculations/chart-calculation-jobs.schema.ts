import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { clientProfiles } from "../clients/client-profiles.schema";
import { users } from "../identity/accounts.schema";
import { calculationRecords } from "./calculation-records.schema";
import {
  chartCalculationJobMethodValues,
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
      .references(() => clientProfiles.userId, { onDelete: "cascade" }),
    resultCalculationId: uuid("result_calculation_id").references(() => calculationRecords.id, {
      onDelete: "set null"
    }),
    method: text("method").notNull().default("natal"),
    status: text("status").notNull().default("queued"),
    inputFingerprint: text("input_fingerprint").notNull(),
    inputSnapshot: jsonb("input_snapshot").notNull(),
    settingsSnapshot: jsonb("settings_snapshot").notNull(),
    provider: text("provider").notNull().default("kerykeion"),
    schemaVersion: text("schema_version").notNull().default("chart-result.v1"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lockedBy: text("locked_by"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
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
    check("chart_calculation_jobs_attempts_check", sql`${table.attempts} >= 0`),
    check("chart_calculation_jobs_max_attempts_check", sql`${table.maxAttempts} > 0`),
    index("chart_calculation_jobs_owner_idx").on(table.ownerUserId),
    index("chart_calculation_jobs_client_idx").on(table.clientId),
    index("chart_calculation_jobs_status_updated_idx").on(table.status, table.updatedAt),
    uniqueIndex("chart_calculation_jobs_active_fingerprint_unique")
      .on(table.ownerUserId, table.inputFingerprint)
      .where(sql`${table.status} in ('queued', 'processing')`),
    uniqueIndex("chart_calculation_jobs_success_fingerprint_unique")
      .on(table.ownerUserId, table.inputFingerprint)
      .where(sql`${table.status} = 'succeeded'`)
  ]
);
