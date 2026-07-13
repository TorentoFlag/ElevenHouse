import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  calculationModeValues,
  calculationModuleValues,
  calculationStatusValues,
  formatCalculationSqlValues
} from "./calculation-values";

export const calculationRecords = pgTable(
  "calculation_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    mode: text("mode").notNull(),
    methodCode: text("method_code").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("calculated"),
    requestFingerprint: text("request_fingerprint").notNull(),
    inputData: jsonb("input_data").notNull(),
    resultData: jsonb("result_data").notNull(),
    resultSummary: jsonb("result_summary").notNull(),
    resultChecksum: text("result_checksum").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "calculation_records_module_check",
      sql`${table.module} in ${sql.raw(formatCalculationSqlValues(calculationModuleValues))}`
    ),
    check(
      "calculation_records_mode_check",
      sql`${table.mode} in ${sql.raw(formatCalculationSqlValues(calculationModeValues))}`
    ),
    check(
      "calculation_records_status_check",
      sql`${table.status} in ${sql.raw(formatCalculationSqlValues(calculationStatusValues))}`
    ),
    check(
      "calculation_records_request_fingerprint_check",
      sql`${table.requestFingerprint} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check("calculation_records_input_data_object_check", sql`jsonb_typeof(${table.inputData}) = 'object'`),
    check("calculation_records_result_data_object_check", sql`jsonb_typeof(${table.resultData}) = 'object'`),
    check(
      "calculation_records_result_summary_object_check",
      sql`jsonb_typeof(${table.resultSummary}) = 'object'`
    ),
    check(
      "calculation_records_result_checksum_check",
      sql`${table.resultChecksum} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    uniqueIndex("calculation_records_exact_request_unique").on(
      table.ownerUserId,
      table.module,
      table.mode,
      table.methodCode,
      table.requestFingerprint
    ),
    index("calculation_records_owner_updated_id_idx").on(
      table.ownerUserId,
      table.updatedAt,
      table.id
    ),
    index("calculation_records_owner_status_updated_id_idx").on(
      table.ownerUserId,
      table.status,
      table.updatedAt,
      table.id
    ),
    index("calculation_records_owner_module_created_id_idx").on(
      table.ownerUserId,
      table.module,
      table.createdAt,
      table.id
    ),
    index("calculation_records_owner_status_module_created_id_idx").on(
      table.ownerUserId,
      table.status,
      table.module,
      table.createdAt,
      table.id
    )
  ]
);
