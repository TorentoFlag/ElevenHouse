import { sql } from "drizzle-orm";
import {
  MATRIX_PDF_REQUESTED_EVENT,
  type MatrixPdfJob,
  type MatrixPdfJobStatus,
  type MatrixPdfJobStore,
  type MatrixPdfRenderClaim,
  type MatrixReportContent,
  type MatrixReportLocale
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  calculationArtifacts,
  calculationRecords,
  matrixPdfJobs,
  matrixReportDrafts,
  mediaAssets,
  outboxEvents
} from "../../schema";

type MatrixPdfJobRow = typeof matrixPdfJobs.$inferSelect;
type MatrixPdfClaimRow = MatrixPdfJobRow & {
  readonly reportContent: MatrixReportContent;
  readonly reportPlainText: string;
  readonly storageBucket: string;
  readonly storageKey: string;
  readonly originalFileName: string;
};

export function createDrizzleMatrixPdfJobStore(database: ElevenHouseDatabase): MatrixPdfJobStore {
  return {
    findLatestByCalculation: async (input) => {
      const result = await database.execute(sql<MatrixPdfJobRow>`
        select ${jobSelectColumns()}
        from ${matrixPdfJobs}
        where ${matrixPdfJobs.ownerUserId} = ${input.ownerUserId}
          and ${matrixPdfJobs.calculationId} = ${input.calculationId}
        order by ${matrixPdfJobs.createdAt} desc, ${matrixPdfJobs.id} desc
        limit 1
      `);
      return toOptionalJob(result.rows[0] as MatrixPdfJobRow | undefined);
    },
    findById: async (input) => {
      const result = await database.execute(sql<MatrixPdfJobRow>`
        select ${jobSelectColumns()}
        from ${matrixPdfJobs}
        where ${matrixPdfJobs.ownerUserId} = ${input.ownerUserId}
          and ${matrixPdfJobs.calculationId} = ${input.calculationId}
          and ${matrixPdfJobs.id} = ${input.jobId}
        limit 1
      `);
      return toOptionalJob(result.rows[0] as MatrixPdfJobRow | undefined);
    },
    enqueue: async (input) => {
      const now = new Date(input.now);
      const result = await database.execute(sql<MatrixPdfJobRow>`
        with eligible as (
          select
            ${matrixReportDrafts.id} as report_id,
            ${matrixReportDrafts.revision} as report_revision,
            ${matrixReportDrafts.resultChecksum} as result_checksum,
            ${matrixReportDrafts.locale} as locale
          from ${matrixReportDrafts}
          inner join ${calculationRecords}
            on ${calculationRecords.id} = ${matrixReportDrafts.calculationId}
            and ${calculationRecords.ownerUserId} = ${matrixReportDrafts.ownerUserId}
          where ${matrixReportDrafts.id} = ${input.reportId}
            and ${matrixReportDrafts.calculationId} = ${input.calculationId}
            and ${matrixReportDrafts.ownerUserId} = ${input.ownerUserId}
            and ${matrixReportDrafts.revision} = ${input.reportRevision}
            and ${matrixReportDrafts.resultChecksum} = ${input.resultChecksum}
            and ${matrixReportDrafts.locale} = ${input.locale}
            and ${matrixReportDrafts.status} = 'ready'
            and ${calculationRecords.module} = 'matrix'
            and ${calculationRecords.methodCode} = 'ladini_22'
            and ${calculationRecords.resultChecksum} = ${input.resultChecksum}
          for update of ${matrixReportDrafts}, ${calculationRecords}
        ),
        existing_job as (
          select ${matrixPdfJobs}.*
          from ${matrixPdfJobs}
          inner join eligible
            on ${matrixPdfJobs.reportId} = eligible.report_id
            and ${matrixPdfJobs.reportRevision} = eligible.report_revision
            and ${matrixPdfJobs.resultChecksum} = eligible.result_checksum
            and ${matrixPdfJobs.locale} = eligible.locale
          where ${matrixPdfJobs.ownerUserId} = ${input.ownerUserId}
            and ${matrixPdfJobs.calculationId} = ${input.calculationId}
        ),
        created_media as (
          insert into ${mediaAssets} (
            "id", "owner_user_id", "purpose", "status", "visibility", "storage_bucket",
            "storage_key", "original_file_name", "mime_type", "size_bytes", "created_at", "updated_at"
          )
          select
            ${input.mediaAssetId}, ${input.ownerUserId}, 'matrix_report_pdf', 'processing', 'private',
            ${input.privateStorageBucket}, ${input.storageKey}, ${input.originalFileName},
            'application/pdf', 0, ${now}, ${now}
          from eligible
          where not exists (select 1 from existing_job)
          returning "id"
        ),
        created_artifact as (
          insert into ${calculationArtifacts} (
            "id", "calculation_id", "media_asset_id", "artifact_type", "status", "created_at", "updated_at"
          )
          select ${input.artifactId}, ${input.calculationId}, created_media.id, 'pdf', 'generating', ${now}, ${now}
          from created_media
          returning "id"
        ),
        created_job as (
          insert into ${matrixPdfJobs} (
            "id", "calculation_id", "owner_user_id", "report_id", "report_revision",
            "result_checksum", "locale", "status", "artifact_id", "media_asset_id",
            "failure_reason", "created_at", "updated_at"
          )
          select
            ${input.id}, ${input.calculationId}, ${input.ownerUserId}, eligible.report_id,
            eligible.report_revision, eligible.result_checksum, eligible.locale, 'queued',
            created_artifact.id, created_media.id, null, ${now}, ${now}
          from eligible, created_media, created_artifact
          returning *
        ),
        created_outbox as (
          insert into ${outboxEvents} (
            "id", "event_type", "aggregate_id", "payload", "status", "attempts",
            "available_at", "created_at", "updated_at"
          )
          select
            ${input.outboxEventId}, '${sql.raw(MATRIX_PDF_REQUESTED_EVENT)}', created_job.id,
            jsonb_build_object(
              'jobId', created_job.id,
              'ownerUserId', created_job.owner_user_id,
              'calculationId', created_job.calculation_id
            ),
            'pending', 0, ${now}, ${now}, ${now}
          from created_job
          returning "id"
        )
        select ${rawJobSelectColumns()} from created_job
        where exists (select 1 from created_outbox)
        union all
        select ${rawJobSelectColumns()} from existing_job
        limit 1
      `);
      return toOptionalJob(result.rows[0] as MatrixPdfJobRow | undefined);
    },
    claimForRendering: async (input) => {
      const now = new Date(input.now);
      const result = await database.execute(sql<MatrixPdfClaimRow>`
        with claimed as (
          update ${matrixPdfJobs}
          set "status" = 'processing', "failure_reason" = null, "updated_at" = ${now}
          from ${matrixReportDrafts}, ${calculationRecords}, ${mediaAssets}
          where ${matrixPdfJobs.id} = ${input.jobId}
            and ${matrixPdfJobs.status} in ('queued', 'processing')
            and ${matrixReportDrafts.id} = ${matrixPdfJobs.reportId}
            and ${matrixReportDrafts.calculationId} = ${matrixPdfJobs.calculationId}
            and ${matrixReportDrafts.ownerUserId} = ${matrixPdfJobs.ownerUserId}
            and ${matrixReportDrafts.status} = 'ready'
            and ${matrixReportDrafts.revision} = ${matrixPdfJobs.reportRevision}
            and ${matrixReportDrafts.resultChecksum} = ${matrixPdfJobs.resultChecksum}
            and ${calculationRecords.id} = ${matrixPdfJobs.calculationId}
            and ${calculationRecords.ownerUserId} = ${matrixPdfJobs.ownerUserId}
            and ${calculationRecords.resultChecksum} = ${matrixPdfJobs.resultChecksum}
            and ${mediaAssets.id} = ${matrixPdfJobs.mediaAssetId}
            and ${mediaAssets.ownerUserId} = ${matrixPdfJobs.ownerUserId}
            and ${mediaAssets.visibility} = 'private'
            and ${mediaAssets.purpose} = 'matrix_report_pdf'
          returning
            ${jobReturningColumns()},
            ${matrixReportDrafts.content} as "reportContent",
            ${matrixReportDrafts.plainText} as "reportPlainText",
            ${mediaAssets.storageBucket} as "storageBucket",
            ${mediaAssets.storageKey} as "storageKey",
            ${mediaAssets.originalFileName} as "originalFileName"
        )
        select * from claimed
      `);
      const row = result.rows[0] as MatrixPdfClaimRow | undefined;
      if (!row) return null;
      return toRenderClaim(row);
    },
    complete: async (input) => {
      const result = await database.execute(sql<MatrixPdfJobRow>`
        with updated_job as (
          update ${matrixPdfJobs}
          set "status" = 'ready', "failure_reason" = null, "updated_at" = ${new Date(input.now)}
          where ${matrixPdfJobs.id} = ${input.jobId}
            and ${matrixPdfJobs.status} in ('processing', 'ready')
          returning *
        ),
        updated_media as (
          update ${mediaAssets}
          set "status" = 'ready', "size_bytes" = ${input.sizeBytes},
              "checksum_sha256" = ${input.checksumSha256}, "failure_reason" = null,
              "updated_at" = ${new Date(input.now)}
          from updated_job
          where ${mediaAssets.id} = updated_job.media_asset_id
          returning ${mediaAssets.id}
        ),
        updated_artifact as (
          update ${calculationArtifacts}
          set "status" = 'ready', "updated_at" = ${new Date(input.now)}
          from updated_job
          where ${calculationArtifacts.id} = updated_job.artifact_id
          returning ${calculationArtifacts.id}
        )
        select ${rawJobSelectColumns()} from updated_job
        where exists (select 1 from updated_media) and exists (select 1 from updated_artifact)
      `);
      return toOptionalJob(result.rows[0] as MatrixPdfJobRow | undefined);
    },
    fail: async (input) => {
      const reason = input.reason.trim().slice(0, 500) || "PDF generation failed";
      const now = new Date(input.now);
      const result = await database.execute(sql<MatrixPdfJobRow>`
        with updated_job as (
          update ${matrixPdfJobs}
          set "status" = 'failed', "failure_reason" = ${reason}, "updated_at" = ${now}
          where ${matrixPdfJobs.id} = ${input.jobId}
            and ${matrixPdfJobs.status} in ('queued', 'processing', 'failed')
          returning *
        ),
        updated_media as (
          update ${mediaAssets}
          set "status" = 'failed', "failure_reason" = ${reason}, "updated_at" = ${now}
          from updated_job
          where ${mediaAssets.id} = updated_job.media_asset_id
          returning ${mediaAssets.id}
        ),
        updated_artifact as (
          update ${calculationArtifacts}
          set "status" = 'failed', "updated_at" = ${now}
          from updated_job
          where ${calculationArtifacts.id} = updated_job.artifact_id
          returning ${calculationArtifacts.id}
        )
        select ${rawJobSelectColumns()} from updated_job
        where exists (select 1 from updated_media) and exists (select 1 from updated_artifact)
      `);
      return toOptionalJob(result.rows[0] as MatrixPdfJobRow | undefined);
    }
  };
}

function jobSelectColumns() {
  return sql`
    ${matrixPdfJobs.id} as "id",
    ${matrixPdfJobs.calculationId} as "calculationId",
    ${matrixPdfJobs.ownerUserId} as "ownerUserId",
    ${matrixPdfJobs.reportId} as "reportId",
    ${matrixPdfJobs.reportRevision} as "reportRevision",
    ${matrixPdfJobs.resultChecksum} as "resultChecksum",
    ${matrixPdfJobs.locale} as "locale",
    ${matrixPdfJobs.status} as "status",
    ${matrixPdfJobs.artifactId} as "artifactId",
    ${matrixPdfJobs.mediaAssetId} as "mediaAssetId",
    ${matrixPdfJobs.failureReason} as "failureReason",
    ${matrixPdfJobs.createdAt} as "createdAt",
    ${matrixPdfJobs.updatedAt} as "updatedAt"
  `;
}

function rawJobSelectColumns() {
  return sql.raw(`
    "id" as "id", "calculation_id" as "calculationId", "owner_user_id" as "ownerUserId",
    "report_id" as "reportId", "report_revision" as "reportRevision",
    "result_checksum" as "resultChecksum", "locale" as "locale", "status" as "status",
    "artifact_id" as "artifactId", "media_asset_id" as "mediaAssetId",
    "failure_reason" as "failureReason", "created_at" as "createdAt", "updated_at" as "updatedAt"
  `);
}

function jobReturningColumns() {
  return sql.raw(`
    "matrix_pdf_jobs"."id" as "id",
    "matrix_pdf_jobs"."calculation_id" as "calculationId",
    "matrix_pdf_jobs"."owner_user_id" as "ownerUserId",
    "matrix_pdf_jobs"."report_id" as "reportId",
    "matrix_pdf_jobs"."report_revision" as "reportRevision",
    "matrix_pdf_jobs"."result_checksum" as "resultChecksum",
    "matrix_pdf_jobs"."locale" as "locale",
    "matrix_pdf_jobs"."status" as "status",
    "matrix_pdf_jobs"."artifact_id" as "artifactId",
    "matrix_pdf_jobs"."media_asset_id" as "mediaAssetId",
    "matrix_pdf_jobs"."failure_reason" as "failureReason",
    "matrix_pdf_jobs"."created_at" as "createdAt",
    "matrix_pdf_jobs"."updated_at" as "updatedAt"
  `);
}

function toOptionalJob(row: MatrixPdfJobRow | undefined): MatrixPdfJob | null {
  return row ? toJob(row) : null;
}

function toJob(row: MatrixPdfJobRow): MatrixPdfJob {
  return {
    id: row.id,
    calculationId: row.calculationId,
    ownerUserId: row.ownerUserId,
    reportId: row.reportId,
    reportRevision: row.reportRevision,
    resultChecksum: row.resultChecksum,
    locale: row.locale as MatrixReportLocale,
    status: row.status as MatrixPdfJobStatus,
    artifactId: row.artifactId,
    mediaAssetId: row.mediaAssetId,
    failureReason: row.failureReason,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toRenderClaim(row: MatrixPdfClaimRow): MatrixPdfRenderClaim {
  return {
    job: toJob(row),
    report: { content: row.reportContent, plainText: row.reportPlainText },
    storageBucket: row.storageBucket,
    storageKey: row.storageKey,
    originalFileName: row.originalFileName
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
