import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { AiUsageAttempt, AiUsageSafeErrorCode, AiUsageStore } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { aiUsageRecords } from "../../schema";

type AiUsageRow = typeof aiUsageRecords.$inferSelect;
type AiUsageTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type AiUsageDatabase = ElevenHouseDatabase | AiUsageTransaction;

export function createDrizzleAiUsageStore(database: ElevenHouseDatabase): AiUsageStore {
  return {
    startAttempt: (input) =>
      database.transaction(async (transaction) => {
        const [inserted] = await transaction
          .insert(aiUsageRecords)
          .values({
                id: input.id,
                status: "started",
                feature: input.feature,
                promptId: input.promptId,
                promptVersion: input.promptVersion,
                provider: input.provider,
                ownerSafetyId: input.ownerSafetyId,
                resourceType: input.resourceEvidence?.resourceType ?? null,
                resourceId: input.resourceEvidence?.resourceId ?? null,
                sourceChecksum: input.resourceEvidence?.sourceChecksum ?? null,
                model: null,
                finishReason: null,
                safeErrorCode: null,
                promptTokens: null,
                completionTokens: null,
                totalTokens: null,
                durationMs: null,
                startedAt: new Date(input.startedAt),
                completedAt: null
              })
          .onConflictDoNothing({ target: aiUsageRecords.id })
          .returning();
        const row = inserted ?? (await findAiUsageRow(transaction, input.id));
        if (!row) throw new Error("AI usage attempt disappeared during exact replay");
        return toAiUsageAttempt(row);
      }),
    completeAttempt: (input) =>
      database.transaction(async (transaction) => {
        const [updated] = await transaction
          .update(aiUsageRecords)
          .set({
            status: "succeeded",
            model: input.model,
            finishReason: input.finishReason,
            safeErrorCode: null,
            promptTokens: input.promptTokens,
            completionTokens: input.completionTokens,
            totalTokens: input.totalTokens,
            durationMs: input.durationMs,
            completedAt: new Date(input.completedAt)
          })
          .where(and(eq(aiUsageRecords.id, input.attemptId), eq(aiUsageRecords.status, "started")))
          .returning();
        const row = updated ?? (await findAiUsageRow(transaction, input.attemptId));
        return row ? toAiUsageAttempt(row) : null;
      }),
    failAttempt: (input) =>
      database.transaction(async (transaction) => {
        const [updated] = await transaction
          .update(aiUsageRecords)
          .set({
            status: "failed",
            model: null,
            finishReason: null,
            safeErrorCode: input.safeErrorCode,
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
            durationMs: input.durationMs,
            completedAt: new Date(input.completedAt)
          })
          .where(and(eq(aiUsageRecords.id, input.attemptId), eq(aiUsageRecords.status, "started")))
          .returning();
        const row = updated ?? (await findAiUsageRow(transaction, input.attemptId));
        return row ? toAiUsageAttempt(row) : null;
      }),
    reconcileStaleAttempts: (input) =>
      database.transaction(async (transaction) => {
        const candidates = await transaction
          .select({ id: aiUsageRecords.id })
          .from(aiUsageRecords)
          .where(
            and(
              eq(aiUsageRecords.status, "started"),
              lte(aiUsageRecords.startedAt, new Date(input.startedBefore))
            )
          )
          .orderBy(asc(aiUsageRecords.startedAt), asc(aiUsageRecords.id))
          .limit(input.limit)
          .for("update", { of: aiUsageRecords, skipLocked: true });
        if (candidates.length === 0) return [];
        const reconciledAt = new Date(input.reconciledAt);
        const rows = await transaction
          .update(aiUsageRecords)
          .set({
            status: "indeterminate",
            model: null,
            finishReason: null,
            safeErrorCode: "AI_USAGE_OUTCOME_INDETERMINATE",
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
            durationMs: sql<number>`least(2147483647, greatest(0, floor(extract(epoch from (${reconciledAt} - ${aiUsageRecords.startedAt})) * 1000)))::integer`,
            completedAt: reconciledAt
          })
          .where(
            and(
              inArray(
                aiUsageRecords.id,
                candidates.map(({ id }) => id)
              ),
              eq(aiUsageRecords.status, "started")
            )
          )
          .returning();
        return rows.map(toAiUsageAttempt);
      })
  };
}

async function findAiUsageRow(
  database: AiUsageDatabase,
  attemptId: string
): Promise<AiUsageRow | undefined> {
  const [row] = await database
    .select()
    .from(aiUsageRecords)
    .where(eq(aiUsageRecords.id, attemptId))
    .limit(1);
  return row;
}

function toAiUsageAttempt(row: AiUsageRow): AiUsageAttempt {
  return {
    id: row.id,
    status: row.status as AiUsageAttempt["status"],
    feature: row.feature,
    promptId: row.promptId,
    promptVersion: row.promptVersion,
    provider: row.provider,
    ownerSafetyId: row.ownerSafetyId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    sourceChecksum: row.sourceChecksum,
    model: row.model,
    finishReason: row.finishReason,
    safeErrorCode: row.safeErrorCode as AiUsageSafeErrorCode | null,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
    durationMs: row.durationMs,
    startedAt: toIsoString(row.startedAt),
    completedAt: row.completedAt ? toIsoString(row.completedAt) : null
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
