import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { calculationArtifacts } from "../calculations/calculation-artifacts.schema";
import { calculationRecords } from "../calculations/calculation-records.schema";
import { mediaAssets } from "../media/media-assets.schema";
import { matrixReportDrafts } from "./matrix-report-drafts.schema";
import {
  formatMatrixSqlValues,
  matrixPdfJobStatusValues,
  matrixReportLocaleValues
} from "./matrix-values";

/** @deprecated Transitional adapter-only schema. Not exported into the baseline. */
export const matrixPdfJobs = pgTable(
  "matrix_pdf_jobs",
  {
    id: uuid("id").primaryKey(),
    calculationId: uuid("calculation_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    reportId: uuid("report_id").notNull(),
    reportRevision: integer("report_revision").notNull(),
    resultChecksum: text("result_checksum").notNull(),
    locale: text("locale").notNull(),
    status: text("status").notNull().default("queued"),
    artifactId: uuid("artifact_id").notNull(),
    mediaAssetId: uuid("media_asset_id").notNull(),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("matrix_pdf_jobs_idempotency_unique")
      .on(
        table.ownerUserId,
        table.calculationId,
        table.reportId,
        table.reportRevision,
        table.resultChecksum,
        table.locale
      )
      .where(sql`${table.status} <> 'failed'`),
    check("matrix_pdf_jobs_report_revision_check", sql`${table.reportRevision} > 0`),
    check(
      "matrix_pdf_jobs_result_checksum_check",
      sql`${table.resultChecksum} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "matrix_pdf_jobs_locale_check",
      sql`${table.locale} in ${sql.raw(formatMatrixSqlValues(matrixReportLocaleValues))}`
    ),
    check(
      "matrix_pdf_jobs_status_check",
      sql`${table.status} in ${sql.raw(formatMatrixSqlValues(matrixPdfJobStatusValues))}`
    ),
    check(
      "matrix_pdf_jobs_failure_reason_check",
      sql`${table.failureReason} is null or length(trim(${table.failureReason})) between 1 and 500`
    ),
    foreignKey({
      columns: [table.calculationId, table.ownerUserId],
      foreignColumns: [calculationRecords.id, calculationRecords.ownerUserId],
      name: "matrix_pdf_jobs_calculation_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.reportId, table.calculationId, table.ownerUserId],
      foreignColumns: [
        matrixReportDrafts.id,
        matrixReportDrafts.calculationId,
        matrixReportDrafts.ownerUserId
      ],
      name: "matrix_pdf_jobs_report_id_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.artifactId, table.calculationId],
      foreignColumns: [calculationArtifacts.id, calculationArtifacts.calculationId],
      name: "matrix_pdf_jobs_artifact_id_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.mediaAssetId, table.ownerUserId],
      foreignColumns: [mediaAssets.id, mediaAssets.ownerUserId],
      name: "matrix_pdf_jobs_media_asset_id_fk"
    }).onDelete("restrict"),
    index("matrix_pdf_jobs_owner_calculation_created_idx").on(
      table.ownerUserId,
      table.calculationId,
      table.createdAt,
      table.id
    ),
    index("matrix_pdf_jobs_status_updated_idx").on(table.status, table.updatedAt)
  ]
);
