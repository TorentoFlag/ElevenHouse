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
  unique,
  uuid
} from "drizzle-orm/pg-core";
import type { MatrixReportContent } from "@elevenhouse/domain";
import { calculationRecords } from "../calculations/calculation-records.schema";
import {
  formatMatrixSqlValues,
  matrixReportLocaleValues,
  matrixReportSourceValues,
  matrixReportStatusValues
} from "./matrix-values";

export const matrixReportDrafts = pgTable(
  "matrix_report_drafts",
  {
    id: uuid("id").primaryKey(),
    calculationId: uuid("calculation_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    source: text("source").notNull(),
    status: text("status").notNull(),
    locale: text("locale").notNull(),
    content: jsonb("content").$type<MatrixReportContent>().notNull(),
    plainText: text("plain_text").notNull(),
    resultChecksum: text("result_checksum").notNull(),
    revision: integer("revision").notNull().default(1),
    modelId: text("model_id"),
    promptVersion: text("prompt_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("matrix_report_drafts_calculation_unique").on(table.calculationId),
    unique("matrix_report_drafts_identity_unique").on(
      table.id,
      table.calculationId,
      table.ownerUserId
    ),
    check(
      "matrix_report_drafts_source_check",
      sql`${table.source} in ${sql.raw(formatMatrixSqlValues(matrixReportSourceValues))}`
    ),
    check(
      "matrix_report_drafts_status_check",
      sql`${table.status} in ${sql.raw(formatMatrixSqlValues(matrixReportStatusValues))}`
    ),
    check(
      "matrix_report_drafts_locale_check",
      sql`${table.locale} in ${sql.raw(formatMatrixSqlValues(matrixReportLocaleValues))}`
    ),
    check("matrix_report_drafts_content_object_check", sql`jsonb_typeof(${table.content}) = 'object'`),
    check(
      "matrix_report_drafts_plain_text_length_check",
      sql`length(trim(${table.plainText})) between 1 and 50000`
    ),
    check(
      "matrix_report_drafts_result_checksum_check",
      sql`${table.resultChecksum} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check("matrix_report_drafts_revision_check", sql`${table.revision} > 0`),
    foreignKey({
      columns: [table.calculationId, table.ownerUserId],
      foreignColumns: [calculationRecords.id, calculationRecords.ownerUserId],
      name: "matrix_report_drafts_calculation_owner_fk"
    }).onDelete("cascade"),
    index("matrix_report_drafts_owner_calculation_idx").on(table.ownerUserId, table.calculationId)
  ]
);
