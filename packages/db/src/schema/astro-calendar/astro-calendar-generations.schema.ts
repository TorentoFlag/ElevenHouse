import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  astroCalendarGenerationStatusValues,
  formatAstroCalendarSqlValues
} from "./astro-calendar-values";

export const astroCalendarGenerations = pgTable(
  "astro_calendar_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("calculating"),
    inputFingerprint: text("input_fingerprint").notNull(),
    rangeStart: date("range_start", { mode: "string" }).notNull(),
    rangeEnd: date("range_end", { mode: "string" }).notNull(),
    timeZone: text("time_zone").notNull(),
    requestSnapshot: jsonb("request_snapshot").notNull(),
    settingsSnapshot: jsonb("settings_snapshot").notNull(),
    readinessSummary: jsonb("readiness_summary").notNull(),
    summary: jsonb("summary").notNull().default({}),
    warnings: jsonb("warnings").notNull().default([]),
    provider: jsonb("provider"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "astro_calendar_generations_status_check",
      sql`${table.status} in ${sql.raw(formatAstroCalendarSqlValues(astroCalendarGenerationStatusValues))}`
    ),
    check(
      "astro_calendar_generations_fingerprint_check",
      sql`${table.inputFingerprint} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check("astro_calendar_generations_range_check", sql`${table.rangeEnd} >= ${table.rangeStart}`),
    check("astro_calendar_generations_timezone_check", sql`length(trim(${table.timeZone})) > 0`),
    check(
      "astro_calendar_generations_request_snapshot_object_check",
      sql`jsonb_typeof(${table.requestSnapshot}) = 'object'`
    ),
    check(
      "astro_calendar_generations_settings_snapshot_object_check",
      sql`jsonb_typeof(${table.settingsSnapshot}) = 'object'`
    ),
    check(
      "astro_calendar_generations_readiness_summary_object_check",
      sql`jsonb_typeof(${table.readinessSummary}) = 'object'`
    ),
    check(
      "astro_calendar_generations_summary_object_check",
      sql`jsonb_typeof(${table.summary}) = 'object'`
    ),
    check(
      "astro_calendar_generations_warnings_array_check",
      sql`jsonb_typeof(${table.warnings}) = 'array'`
    ),
    index("astro_calendar_generations_owner_range_idx").on(
      table.ownerUserId,
      table.rangeStart,
      table.rangeEnd
    ),
    index("astro_calendar_generations_status_updated_idx").on(table.status, table.updatedAt),
    uniqueIndex("astro_calendar_generations_fingerprint_unique").on(
      table.ownerUserId,
      table.inputFingerprint
    )
  ]
);
