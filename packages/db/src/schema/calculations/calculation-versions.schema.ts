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
import { calculationRecords } from "./calculation-records.schema";

export const calculationVersions = pgTable(
  "calculation_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calculationId: uuid("calculation_id")
      .notNull()
      .references(() => calculationRecords.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    methodVersion: text("method_version").notNull(),
    settingsSnapshot: jsonb("settings_snapshot").notNull(),
    inputSnapshot: jsonb("input_snapshot").notNull(),
    resultSnapshot: jsonb("result_snapshot").notNull(),
    resultSummary: jsonb("result_summary").notNull(),
    resultChecksum: text("result_checksum").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("calculation_versions_version_number_check", sql`${table.versionNumber} > 0`),
    uniqueIndex("calculation_versions_record_version_unique").on(
      table.calculationId,
      table.versionNumber
    ),
    index("calculation_versions_record_version_idx").on(table.calculationId, table.versionNumber),
    index("calculation_versions_record_id_idx").on(table.calculationId, table.id)
  ]
);
