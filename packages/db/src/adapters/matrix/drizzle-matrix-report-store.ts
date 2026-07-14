import { and, eq, sql } from "drizzle-orm";
import type {
  MatrixReportContent,
  MatrixReportDraft,
  MatrixReportLocale,
  MatrixReportSource,
  MatrixReportStatus,
  MatrixReportStore
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { calculationRecords, matrixReportDrafts } from "../../schema";

type MatrixReportRow = typeof matrixReportDrafts.$inferSelect;

export function createDrizzleMatrixReportStore(database: ElevenHouseDatabase): MatrixReportStore {
  return {
    findByCalculation: async (input) => {
      const [row] = await database
        .select()
        .from(matrixReportDrafts)
        .where(
          and(
            eq(matrixReportDrafts.ownerUserId, input.ownerUserId),
            eq(matrixReportDrafts.calculationId, input.calculationId)
          )
        )
        .limit(1);
      return row ? toMatrixReport(row) : null;
    },
    upsert: async (input) => {
      const now = new Date(input.now);
      const result = await database.execute(sql<MatrixReportRow>`
        with owned_calculation as (
          select ${calculationRecords.id}
          from ${calculationRecords}
          where ${calculationRecords.id} = ${input.calculationId}
            and ${calculationRecords.ownerUserId} = ${input.ownerUserId}
            and ${calculationRecords.module} = 'matrix'
            and ${calculationRecords.methodCode} = 'ladini_22'
            and ${calculationRecords.resultChecksum} = ${input.expectedResultChecksum}
          for update
        )
        insert into ${matrixReportDrafts} (
          "id", "calculation_id", "owner_user_id", "source", "status", "locale",
          "content", "plain_text", "result_checksum", "revision", "model_id",
          "prompt_version", "created_at", "updated_at"
        )
        select
          ${input.id},
          ${input.calculationId},
          ${input.ownerUserId},
          ${input.source},
          ${input.status},
          ${input.locale},
          ${JSON.stringify(input.content)}::jsonb,
          ${input.plainText},
          ${input.resultChecksum},
          1,
          ${input.modelId},
          ${input.promptVersion},
          ${now},
          ${now}
        from owned_calculation
        on conflict ("calculation_id") do update set
          "source" = excluded."source",
          "status" = excluded."status",
          "locale" = excluded."locale",
          "content" = excluded."content",
          "plain_text" = excluded."plain_text",
          "result_checksum" = excluded."result_checksum",
          "revision" = ${matrixReportDrafts.revision} + 1,
          "model_id" = excluded."model_id",
          "prompt_version" = excluded."prompt_version",
          "updated_at" = excluded."updated_at"
        returning
          ${matrixReportDrafts.id} as "id",
          ${matrixReportDrafts.calculationId} as "calculationId",
          ${matrixReportDrafts.ownerUserId} as "ownerUserId",
          ${matrixReportDrafts.source} as "source",
          ${matrixReportDrafts.status} as "status",
          ${matrixReportDrafts.locale} as "locale",
          ${matrixReportDrafts.content} as "content",
          ${matrixReportDrafts.plainText} as "plainText",
          ${matrixReportDrafts.resultChecksum} as "resultChecksum",
          ${matrixReportDrafts.revision} as "revision",
          ${matrixReportDrafts.modelId} as "modelId",
          ${matrixReportDrafts.promptVersion} as "promptVersion",
          ${matrixReportDrafts.createdAt} as "createdAt",
          ${matrixReportDrafts.updatedAt} as "updatedAt"
      `);
      const row = result.rows[0] as MatrixReportRow | undefined;
      return row ? toMatrixReport(row) : null;
    }
  };
}

function toMatrixReport(row: MatrixReportRow): MatrixReportDraft {
  return {
    id: row.id,
    calculationId: row.calculationId,
    ownerUserId: row.ownerUserId,
    source: row.source as MatrixReportSource,
    status: row.status as MatrixReportStatus,
    locale: row.locale as MatrixReportLocale,
    content: row.content as MatrixReportContent,
    plainText: row.plainText,
    resultChecksum: row.resultChecksum,
    revision: row.revision,
    modelId: row.modelId,
    promptVersion: row.promptVersion,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
