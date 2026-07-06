import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { calculationRecords } from "./calculation-records.schema";
import { calculationVersions } from "./calculation-versions.schema";
import {
  calculationInterpretationSourceValues,
  calculationInterpretationStatusValues,
  formatCalculationSqlValues
} from "./calculation-values";

export const calculationInterpretations = pgTable(
  "calculation_interpretations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calculationId: uuid("calculation_id")
      .notNull()
      .references(() => calculationRecords.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => calculationVersions.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    status: text("status").notNull().default("draft"),
    text: text("text").notNull(),
    modelId: text("model_id"),
    promptVersion: text("prompt_version"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "calculation_interpretations_source_check",
      sql`${table.source} in ${sql.raw(
        formatCalculationSqlValues(calculationInterpretationSourceValues)
      )}`
    ),
    check(
      "calculation_interpretations_status_check",
      sql`${table.status} in ${sql.raw(
        formatCalculationSqlValues(calculationInterpretationStatusValues)
      )}`
    ),
    check(
      "calculation_interpretations_approved_at_check",
      sql`${table.status} <> 'approved' or ${table.approvedAt} is not null`
    ),
    index("calculation_interpretations_record_idx").on(table.calculationId),
    index("calculation_interpretations_version_idx").on(table.versionId)
  ]
);
