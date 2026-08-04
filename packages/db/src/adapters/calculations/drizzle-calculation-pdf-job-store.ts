import { sql } from "drizzle-orm";
import {
  CALCULATION_PDF_DELETE_REQUESTED_EVENT,
  CALCULATION_PDF_REQUESTED_EVENT,
  normalizeCalculationPdfSourceLocator,
  type CalculationModule,
  type CalculationPdfJob,
  type CalculationPdfJobStatus,
  type CalculationPdfJobStore,
  type CalculationPdfLocale
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  calculationArtifacts,
  calculationPdfJobs,
  calculationRecords,
  mediaAssets,
  outboxEvents
} from "../../schema";

type CalculationPdfJobRow = typeof calculationPdfJobs.$inferSelect;

export function createDrizzleCalculationPdfJobStore(
  database: ElevenHouseDatabase
): CalculationPdfJobStore {
  async function findReusable(input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly resultChecksum: string;
    readonly locale: CalculationPdfLocale;
    readonly documentFingerprint: string;
  }): Promise<CalculationPdfJob | null> {
    const result = await database.execute(sql<CalculationPdfJobRow>`
      select ${jobSelectColumns()}
      from ${calculationPdfJobs}
      where ${calculationPdfJobs.ownerUserId} = ${input.ownerUserId}
        and ${calculationPdfJobs.calculationId} = ${input.calculationId}
        and ${calculationPdfJobs.resultChecksum} = ${input.resultChecksum}
        and ${calculationPdfJobs.locale} = ${input.locale}
        and ${calculationPdfJobs.documentFingerprint} = ${input.documentFingerprint}
        and ${calculationPdfJobs.status} in ('queued', 'processing', 'ready')
      order by ${calculationPdfJobs.createdAt} desc, ${calculationPdfJobs.id} desc
      limit 1
    `);
    return toOptionalJob(result.rows[0] as CalculationPdfJobRow | undefined);
  }

  return {
    findLatestByCalculation: async (input) => {
      const result = await database.execute(sql<CalculationPdfJobRow>`
        select ${jobSelectColumns()}
        from ${calculationPdfJobs}
        inner join ${calculationRecords}
          on ${calculationRecords.id} = ${calculationPdfJobs.calculationId}
          and ${calculationRecords.ownerUserId} = ${calculationPdfJobs.ownerUserId}
          and ${calculationRecords.resultChecksum} = ${calculationPdfJobs.resultChecksum}
          and ${calculationRecords.status} <> 'archived'
        where ${calculationPdfJobs.ownerUserId} = ${input.ownerUserId}
          and ${calculationPdfJobs.calculationId} = ${input.calculationId}
          and ${calculationPdfJobs.locale} = ${input.locale}
        order by ${calculationPdfJobs.createdAt} desc, ${calculationPdfJobs.id} desc
        limit 1
      `);
      return toOptionalJob(result.rows[0] as CalculationPdfJobRow | undefined);
    },
    findById: async (input) => {
      const result = await database.execute(sql<CalculationPdfJobRow>`
        select ${jobSelectColumns()}
        from ${calculationPdfJobs}
        where ${calculationPdfJobs.ownerUserId} = ${input.ownerUserId}
          and ${calculationPdfJobs.calculationId} = ${input.calculationId}
          and ${calculationPdfJobs.id} = ${input.jobId}
        limit 1
      `);
      return toOptionalJob(result.rows[0] as CalculationPdfJobRow | undefined);
    },
    findByJobId: async (input) => {
      const result = await database.execute(sql<CalculationPdfJobRow>`
        select ${jobSelectColumns()}
        from ${calculationPdfJobs}
        where ${calculationPdfJobs.id} = ${input.jobId}
        limit 1
      `);
      return toOptionalJob(result.rows[0] as CalculationPdfJobRow | undefined);
    },
    enqueue: async (input) => {
      const sourceLocator = normalizeCalculationPdfSourceLocator(input.sourceLocator);
      const now = new Date(input.now);
      try {
        const result = await database.execute(sql<CalculationPdfJobRow>`
          with eligible as (
            select
              ${calculationRecords.id} as calculation_id,
              ${calculationRecords.ownerUserId} as owner_user_id,
              ${calculationRecords.module} as module,
              ${calculationRecords.methodCode} as method_code,
              ${calculationRecords.resultChecksum} as result_checksum
            from ${calculationRecords}
            where ${calculationRecords.id} = ${input.calculationId}
              and ${calculationRecords.ownerUserId} = ${input.ownerUserId}
              and ${calculationRecords.module} = ${input.module}
              and ${calculationRecords.methodCode} = ${input.methodCode}
              and ${calculationRecords.resultChecksum} = ${input.resultChecksum}
              and ${calculationRecords.status} <> 'archived'
            for update
          ),
          existing_job as (
            select ${calculationPdfJobs}.*
            from ${calculationPdfJobs}, eligible
            where ${calculationPdfJobs.ownerUserId} = eligible.owner_user_id
              and ${calculationPdfJobs.calculationId} = eligible.calculation_id
              and ${calculationPdfJobs.resultChecksum} = eligible.result_checksum
              and ${calculationPdfJobs.locale} = ${input.locale}
              and ${calculationPdfJobs.documentFingerprint} = ${input.documentFingerprint}
              and ${calculationPdfJobs.status} in ('queued', 'processing', 'ready')
          ),
          created_media as (
            insert into ${mediaAssets} (
              "id", "owner_user_id", "purpose", "status", "visibility", "storage_bucket",
              "storage_key", "original_file_name", "mime_type", "size_bytes", "created_at", "updated_at"
            )
            select
              ${input.mediaAssetId}, eligible.owner_user_id, 'calculation_report_pdf',
              'processing', 'private', ${input.privateStorageBucket}, ${input.storageKey},
              ${input.originalFileName}, 'application/pdf', 0, ${now}, ${now}
            from eligible
            where not exists (select 1 from existing_job)
            returning "id"
          ),
          created_artifact as (
            insert into ${calculationArtifacts} (
              "id", "calculation_id", "media_asset_id", "artifact_type", "status", "created_at", "updated_at"
            )
            select ${input.artifactId}, eligible.calculation_id, created_media.id, 'pdf',
                   'generating', ${now}, ${now}
            from eligible, created_media
            returning "id"
          ),
          created_job as (
            insert into ${calculationPdfJobs} (
              "id", "calculation_id", "owner_user_id", "module", "method_code",
              "result_checksum", "locale", "source_locator", "document_fingerprint", "status",
              "artifact_id", "media_asset_id", "failure_code", "failure_reason", "page_count",
              "created_at", "updated_at"
            )
            select
              ${input.id}, eligible.calculation_id, eligible.owner_user_id, eligible.module,
              eligible.method_code, eligible.result_checksum, ${input.locale},
              ${JSON.stringify(sourceLocator)}::jsonb, ${input.documentFingerprint}, 'queued',
              created_artifact.id, created_media.id, null, null, null, ${now}, ${now}
            from eligible, created_media, created_artifact
            returning *
          ),
          created_outbox as (
            insert into ${outboxEvents} (
              "id", "event_type", "aggregate_id", "payload", "status", "attempts",
              "available_at", "created_at", "updated_at"
            )
            select
              ${input.outboxEventId}, '${sql.raw(CALCULATION_PDF_REQUESTED_EVENT)}', created_job.id,
              jsonb_build_object('jobId', created_job.id), 'pending', 0, ${now}, ${now}, ${now}
            from created_job
            returning "id"
          )
          select ${rawJobSelectColumns()} from created_job
          where exists (select 1 from created_outbox)
          union all
          select ${rawJobSelectColumns()} from existing_job
          limit 1
        `);
        return toOptionalJob(result.rows[0] as CalculationPdfJobRow | undefined);
      } catch (error) {
        if (!isIdempotencyConflict(error)) throw error;
        return findReusable(input);
      }
    },
    claimForRendering: async (input) => {
      const now = new Date(input.now);
      const result = await database.execute(sql<CalculationPdfJobRow>`
        with claimed as (
          update ${calculationPdfJobs}
          set "status" = 'processing', "failure_code" = null, "failure_reason" = null,
              "updated_at" = ${now}
          from ${calculationRecords}, ${mediaAssets}
          where ${calculationPdfJobs.id} = ${input.jobId}
            and ${calculationPdfJobs.status} in ('queued', 'processing')
            and ${calculationRecords.id} = ${calculationPdfJobs.calculationId}
            and ${calculationRecords.ownerUserId} = ${calculationPdfJobs.ownerUserId}
            and ${calculationRecords.module} = ${calculationPdfJobs.module}
            and ${calculationRecords.methodCode} = ${calculationPdfJobs.methodCode}
            and ${calculationRecords.resultChecksum} = ${calculationPdfJobs.resultChecksum}
            and ${calculationRecords.status} <> 'archived'
            and ${mediaAssets.id} = ${calculationPdfJobs.mediaAssetId}
            and ${mediaAssets.ownerUserId} = ${calculationPdfJobs.ownerUserId}
            and ${mediaAssets.visibility} = 'private'
            and ${mediaAssets.purpose} = 'calculation_report_pdf'
          returning ${jobReturningColumns()}
        )
        select * from claimed
      `);
      return toOptionalJob(result.rows[0] as CalculationPdfJobRow | undefined);
    },
    complete: async (input) => {
      const now = new Date(input.now);
      const result = await database.execute(sql<CalculationPdfJobRow>`
        with target_job as (
          select ${jobSelectColumns()}
          from ${calculationPdfJobs}
          inner join ${calculationRecords}
            on ${calculationRecords.id} = ${calculationPdfJobs.calculationId}
            and ${calculationRecords.ownerUserId} = ${calculationPdfJobs.ownerUserId}
            and ${calculationRecords.resultChecksum} = ${calculationPdfJobs.resultChecksum}
            and ${calculationRecords.status} <> 'archived'
          where ${calculationPdfJobs.id} = ${input.jobId}
            and ${calculationPdfJobs.status} in ('processing', 'ready')
          for update of ${calculationPdfJobs}, ${calculationRecords}
        ),
        latest_job as (
          select ${calculationPdfJobs.id}
          from ${calculationPdfJobs}, target_job
          where ${calculationPdfJobs.ownerUserId} = target_job."ownerUserId"
            and ${calculationPdfJobs.calculationId} = target_job."calculationId"
            and ${calculationPdfJobs.locale} = target_job."locale"
          order by ${calculationPdfJobs.createdAt} desc, ${calculationPdfJobs.id} desc
          limit 1
        ),
        completed_job as (
          update ${calculationPdfJobs}
          set "status" = 'ready', "failure_code" = null, "failure_reason" = null,
              "page_count" = ${input.pageCount}, "updated_at" = ${now}
          from target_job
          where ${calculationPdfJobs.id} = target_job."id"
            and ${calculationPdfJobs.id} = (select "id" from latest_job)
          returning ${jobReturningColumns()}
        ),
        updated_media as (
          update ${mediaAssets}
          set "status" = 'ready', "size_bytes" = ${input.sizeBytes},
              "checksum_sha256" = ${input.checksumSha256}, "failure_reason" = null,
              "updated_at" = ${now}
          from completed_job
          where ${mediaAssets.id} = completed_job."mediaAssetId"
          returning ${mediaAssets.id}
        ),
        updated_artifact as (
          update ${calculationArtifacts}
          set "status" = 'ready', "updated_at" = ${now}
          from completed_job
          where ${calculationArtifacts.id} = completed_job."artifactId"
          returning ${calculationArtifacts.id}
        ),
        retired_jobs as (
          select ${calculationPdfJobs.id}, ${calculationPdfJobs.artifactId},
                 ${calculationPdfJobs.mediaAssetId}, ${calculationPdfJobs.calculationId}
          from ${calculationPdfJobs}, completed_job
          where ${calculationPdfJobs.ownerUserId} = completed_job."ownerUserId"
            and ${calculationPdfJobs.calculationId} = completed_job."calculationId"
            and ${calculationPdfJobs.locale} = completed_job."locale"
            and ${calculationPdfJobs.id} <> completed_job."id"
            and ${calculationPdfJobs.status} <> 'processing'
          union all
          select target_job."id", target_job."artifactId", target_job."mediaAssetId",
                 target_job."calculationId"
          from target_job
          where target_job."id" <> (select "id" from latest_job)
        ),
        deleted_jobs as (
          delete from ${calculationPdfJobs}
          using retired_jobs
          where ${calculationPdfJobs.id} = retired_jobs."id"
          returning ${calculationPdfJobs.artifactId}, ${calculationPdfJobs.calculationId}
        ),
        deleted_artifacts as (
          delete from ${calculationArtifacts}
          using deleted_jobs
          where ${calculationArtifacts.id} = deleted_jobs.artifact_id
            and ${calculationArtifacts.calculationId} = deleted_jobs.calculation_id
          returning ${calculationArtifacts.mediaAssetId}
        ),
        created_cleanup_events as (
          insert into ${outboxEvents} (
            "event_type", "aggregate_id", "payload", "status", "attempts",
            "available_at", "created_at", "updated_at"
          )
          select
            '${sql.raw(CALCULATION_PDF_DELETE_REQUESTED_EVENT)}', deleted_artifacts."media_asset_id",
            jsonb_build_object('mediaAssetId', deleted_artifacts."media_asset_id"),
            'pending', 0, ${now}, ${now}, ${now}
          from deleted_artifacts
          on conflict ("event_type", "aggregate_id") do nothing
          returning "id"
        )
        select ${completedJobSelectColumns()} from completed_job
        where completed_job."status" = 'ready'
          and exists (select 1 from updated_media)
          and exists (select 1 from updated_artifact)
      `);
      return toOptionalJob(result.rows[0] as CalculationPdfJobRow | undefined);
    },
    fail: async (input) => {
      const code = input.code.trim().slice(0, 100) || "pdf_generation_failed";
      const reason = input.reason.trim().slice(0, 500) || "PDF generation failed";
      const now = new Date(input.now);
      const result = await database.execute(sql<CalculationPdfJobRow>`
        with updated_job as (
          update ${calculationPdfJobs}
          set "status" = 'failed', "failure_code" = ${code}, "failure_reason" = ${reason},
              "updated_at" = ${now}
          where ${calculationPdfJobs.id} = ${input.jobId}
            and ${calculationPdfJobs.status} in ('queued', 'processing', 'failed')
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
      return toOptionalJob(result.rows[0] as CalculationPdfJobRow | undefined);
    }
  };
}

function jobSelectColumns() {
  return sql`
    ${calculationPdfJobs.id} as "id",
    ${calculationPdfJobs.calculationId} as "calculationId",
    ${calculationPdfJobs.ownerUserId} as "ownerUserId",
    ${calculationPdfJobs.module} as "module",
    ${calculationPdfJobs.methodCode} as "methodCode",
    ${calculationPdfJobs.resultChecksum} as "resultChecksum",
    ${calculationPdfJobs.locale} as "locale",
    ${calculationPdfJobs.sourceLocator} as "sourceLocator",
    ${calculationPdfJobs.documentFingerprint} as "documentFingerprint",
    ${calculationPdfJobs.status} as "status",
    ${calculationPdfJobs.artifactId} as "artifactId",
    ${calculationPdfJobs.mediaAssetId} as "mediaAssetId",
    ${calculationPdfJobs.failureCode} as "failureCode",
    ${calculationPdfJobs.failureReason} as "failureReason",
    ${calculationPdfJobs.pageCount} as "pageCount",
    ${calculationPdfJobs.createdAt} as "createdAt",
    ${calculationPdfJobs.updatedAt} as "updatedAt"
  `;
}

function rawJobSelectColumns() {
  return sql.raw(`
    "id" as "id", "calculation_id" as "calculationId", "owner_user_id" as "ownerUserId",
    "module" as "module", "method_code" as "methodCode",
    "result_checksum" as "resultChecksum", "locale" as "locale",
    "source_locator" as "sourceLocator", "document_fingerprint" as "documentFingerprint",
    "status" as "status", "artifact_id" as "artifactId", "media_asset_id" as "mediaAssetId",
    "failure_code" as "failureCode", "failure_reason" as "failureReason",
    "page_count" as "pageCount", "created_at" as "createdAt", "updated_at" as "updatedAt"
  `);
}

function completedJobSelectColumns() {
  return sql.raw(`
    "id" as "id", "calculationId" as "calculationId", "ownerUserId" as "ownerUserId",
    "module" as "module", "methodCode" as "methodCode",
    "resultChecksum" as "resultChecksum", "locale" as "locale",
    "sourceLocator" as "sourceLocator", "documentFingerprint" as "documentFingerprint",
    "status" as "status", "artifactId" as "artifactId", "mediaAssetId" as "mediaAssetId",
    "failureCode" as "failureCode", "failureReason" as "failureReason",
    "pageCount" as "pageCount", "createdAt" as "createdAt", "updatedAt" as "updatedAt"
  `);
}

function jobReturningColumns() {
  return sql.raw(`
    "calculation_pdf_jobs"."id" as "id",
    "calculation_pdf_jobs"."calculation_id" as "calculationId",
    "calculation_pdf_jobs"."owner_user_id" as "ownerUserId",
    "calculation_pdf_jobs"."module" as "module",
    "calculation_pdf_jobs"."method_code" as "methodCode",
    "calculation_pdf_jobs"."result_checksum" as "resultChecksum",
    "calculation_pdf_jobs"."locale" as "locale",
    "calculation_pdf_jobs"."source_locator" as "sourceLocator",
    "calculation_pdf_jobs"."document_fingerprint" as "documentFingerprint",
    "calculation_pdf_jobs"."status" as "status",
    "calculation_pdf_jobs"."artifact_id" as "artifactId",
    "calculation_pdf_jobs"."media_asset_id" as "mediaAssetId",
    "calculation_pdf_jobs"."failure_code" as "failureCode",
    "calculation_pdf_jobs"."failure_reason" as "failureReason",
    "calculation_pdf_jobs"."page_count" as "pageCount",
    "calculation_pdf_jobs"."created_at" as "createdAt",
    "calculation_pdf_jobs"."updated_at" as "updatedAt"
  `);
}

function toOptionalJob(row: CalculationPdfJobRow | undefined): CalculationPdfJob | null {
  return row ? toJob(row) : null;
}

function toJob(row: CalculationPdfJobRow): CalculationPdfJob {
  return {
    id: row.id,
    calculationId: row.calculationId,
    ownerUserId: row.ownerUserId,
    module: row.module as CalculationModule,
    methodCode: row.methodCode,
    resultChecksum: row.resultChecksum,
    locale: row.locale as CalculationPdfLocale,
    sourceLocator: normalizeCalculationPdfSourceLocator(row.sourceLocator),
    documentFingerprint: row.documentFingerprint,
    status: row.status as CalculationPdfJobStatus,
    artifactId: row.artifactId,
    mediaAssetId: row.mediaAssetId,
    failureCode: row.failureCode,
    failureReason: row.failureReason,
    pageCount: row.pageCount,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function isIdempotencyConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    "constraint" in error &&
    error.constraint === "calculation_pdf_jobs_idempotency_unique"
  );
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
