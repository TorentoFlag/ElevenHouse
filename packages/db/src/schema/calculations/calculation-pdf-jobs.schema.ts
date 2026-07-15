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
import { mediaAssets } from "../media/media-assets.schema";
import { calculationArtifacts } from "./calculation-artifacts.schema";
import { calculationRecords } from "./calculation-records.schema";
import {
  calculationModuleValues,
  calculationPdfJobStatusValues,
  calculationPdfLocaleValues,
  formatCalculationSqlValues
} from "./calculation-values";

export const calculationPdfJobs = pgTable(
  "calculation_pdf_jobs",
  {
    id: uuid("id").primaryKey(),
    calculationId: uuid("calculation_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    module: text("module").notNull(),
    methodCode: text("method_code").notNull(),
    resultChecksum: text("result_checksum").notNull(),
    locale: text("locale").notNull(),
    sourceLocator: jsonb("source_locator").$type<Record<string, unknown>>().notNull(),
    documentFingerprint: text("document_fingerprint").notNull(),
    status: text("status").notNull().default("queued"),
    artifactId: uuid("artifact_id").notNull(),
    mediaAssetId: uuid("media_asset_id").notNull(),
    failureCode: text("failure_code"),
    failureReason: text("failure_reason"),
    pageCount: integer("page_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("calculation_pdf_jobs_idempotency_unique")
      .on(
        table.ownerUserId,
        table.calculationId,
        table.resultChecksum,
        table.locale,
        table.documentFingerprint
      )
      .where(sql`${table.status} <> 'failed'`),
    check(
      "calculation_pdf_jobs_module_check",
      sql`${table.module} in ${sql.raw(formatCalculationSqlValues(calculationModuleValues))}`
    ),
    check(
      "calculation_pdf_jobs_method_code_check",
      sql`length(trim(${table.methodCode})) between 1 and 100`
    ),
    check(
      "calculation_pdf_jobs_result_checksum_check",
      sql`${table.resultChecksum} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "calculation_pdf_jobs_locale_check",
      sql`${table.locale} in ${sql.raw(formatCalculationSqlValues(calculationPdfLocaleValues))}`
    ),
    check(
      "calculation_pdf_jobs_source_locator_object_check",
      sql`jsonb_typeof(${table.sourceLocator}) = 'object'`
    ),
    check(
      "calculation_pdf_jobs_document_fingerprint_check",
      sql`${table.documentFingerprint} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "calculation_pdf_jobs_status_check",
      sql`${table.status} in ${sql.raw(formatCalculationSqlValues(calculationPdfJobStatusValues))}`
    ),
    check(
      "calculation_pdf_jobs_failure_code_check",
      sql`${table.failureCode} is null or length(trim(${table.failureCode})) between 1 and 100`
    ),
    check(
      "calculation_pdf_jobs_failure_reason_check",
      sql`${table.failureReason} is null or length(trim(${table.failureReason})) between 1 and 500`
    ),
    check(
      "calculation_pdf_jobs_page_count_check",
      sql`${table.pageCount} is null or ${table.pageCount} > 0`
    ),
    foreignKey({
      columns: [table.calculationId, table.ownerUserId],
      foreignColumns: [calculationRecords.id, calculationRecords.ownerUserId],
      name: "calculation_pdf_jobs_calculation_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.artifactId, table.calculationId],
      foreignColumns: [calculationArtifacts.id, calculationArtifacts.calculationId],
      name: "calculation_pdf_jobs_artifact_id_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.mediaAssetId, table.ownerUserId],
      foreignColumns: [mediaAssets.id, mediaAssets.ownerUserId],
      name: "calculation_pdf_jobs_media_asset_id_fk"
    }).onDelete("restrict"),
    index("calculation_pdf_jobs_owner_calculation_locale_created_idx").on(
      table.ownerUserId,
      table.calculationId,
      table.locale,
      table.createdAt,
      table.id
    ),
    index("calculation_pdf_jobs_status_updated_idx").on(table.status, table.updatedAt)
  ]
);
