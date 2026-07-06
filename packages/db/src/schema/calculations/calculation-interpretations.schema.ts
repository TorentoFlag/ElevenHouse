import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
    versionId: uuid("version_id").notNull(),
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
    foreignKey({
      columns: [table.versionId, table.calculationId],
      foreignColumns: [calculationVersions.id, calculationVersions.calculationId],
      name: "calculation_interpretations_version_calculation_fk"
    }).onDelete("cascade"),
    index("calculation_interpretations_record_idx").on(table.calculationId),
    index("calculation_interpretations_version_idx").on(table.versionId)
  ]
);
