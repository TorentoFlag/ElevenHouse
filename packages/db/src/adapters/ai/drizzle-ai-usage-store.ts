import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { AiUsageAttempt, AiUsageSafeErrorCode, AiUsageStore } from "@elevenhouse/domain";
import {
  ChartAiConsentRequiredError,
  ClientConsentIntegrityError,
  ClientConsentRelationshipInactiveError,
  resolveClientDataConsentState,
  type AiUsageConsentAuthorization,
  type ClientConsentRelationshipStatus,
  type ClientDataConsentRecord
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  aiUsageConsentRecords,
  aiUsageRecords,
  clientAstrologerRelationships,
  clientDataConsents
} from "../../schema";

type AiUsageRow = typeof aiUsageRecords.$inferSelect;
type AiUsageTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type AiUsageDatabase = ElevenHouseDatabase | AiUsageTransaction;

export function createDrizzleAiUsageStore(database: ElevenHouseDatabase): AiUsageStore {
  return {
    startAttempt: (input) =>
      database.transaction(async (transaction) => {
        await assertCurrentConsentAuthorizations(transaction, input.consentAuthorizations);
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
                processingAuthorityVersion: input.processingAuthorityVersion,
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
        if (inserted && input.consentAuthorizations.length > 0) {
          await transaction.insert(aiUsageConsentRecords).values(
            input.consentAuthorizations.map(({ consentRecordId }) => ({
              usageRecordId: input.id,
              consentRecordId
            }))
          );
        }
        const row = inserted ?? (await findAiUsageRow(transaction, input.id));
        if (!row) throw new Error("AI usage attempt disappeared during exact replay");
        return toAiUsageAttempt(transaction, row);
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
        return row ? toAiUsageAttempt(transaction, row) : null;
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
        return row ? toAiUsageAttempt(transaction, row) : null;
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
        return Promise.all(rows.map((row) => toAiUsageAttempt(transaction, row)));
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

async function assertCurrentConsentAuthorizations(
  transaction: AiUsageTransaction,
  authorizations: readonly AiUsageConsentAuthorization[]
): Promise<void> {
  if (authorizations.length === 0) return;
  const expectedByConsentId = new Map(
    authorizations.map((authorization) => [authorization.consentRecordId, authorization])
  );
  const rows = await transaction
    .select({
      consent: clientDataConsents,
      relationship: clientAstrologerRelationships
    })
    .from(clientDataConsents)
    .innerJoin(
      clientAstrologerRelationships,
      and(
        eq(clientAstrologerRelationships.id, clientDataConsents.relationshipId),
        eq(clientAstrologerRelationships.clientUserId, clientDataConsents.clientUserId),
        eq(clientAstrologerRelationships.astrologerUserId, clientDataConsents.astrologerUserId)
      )
    )
    .where(inArray(clientDataConsents.id, [...expectedByConsentId.keys()]))
    .for("share");

  const observedConsentIds = new Set<string>();
  for (const row of rows) {
    const expected = expectedByConsentId.get(row.consent.id);
    if (!expected || observedConsentIds.has(row.consent.id)) {
      throw new ClientConsentIntegrityError(
        "AI usage consent authorization returned inconsistent persistence evidence"
      );
    }
    observedConsentIds.add(row.consent.id);
    if (
      row.consent.clientUserId !== expected.clientUserId ||
      row.consent.astrologerUserId !== expected.astrologerUserId ||
      row.relationship.clientUserId !== expected.clientUserId ||
      row.relationship.astrologerUserId !== expected.astrologerUserId
    ) {
      throw new ClientConsentIntegrityError(
        "AI usage consent authorization does not match its participant identity"
      );
    }
    const relationshipStatus = row.relationship.status as ClientConsentRelationshipStatus;
    if (relationshipStatus !== "active") {
      throw new ClientConsentRelationshipInactiveError(expected.clientUserId, relationshipStatus);
    }
    const consent = toClientDataConsentRecord(row.consent);
    const state = resolveClientDataConsentState({ relationshipStatus, consent });
    if (state !== "granted") {
      throw new ChartAiConsentRequiredError(expected.clientUserId, state);
    }
  }

  for (const authorization of authorizations) {
    if (!observedConsentIds.has(authorization.consentRecordId)) {
      throw new ChartAiConsentRequiredError(authorization.clientUserId, "missing");
    }
  }
}

async function toAiUsageAttempt(
  database: AiUsageDatabase,
  row: AiUsageRow
): Promise<AiUsageAttempt> {
  const consentRows = await database
    .select({ consentRecordId: aiUsageConsentRecords.consentRecordId })
    .from(aiUsageConsentRecords)
    .where(eq(aiUsageConsentRecords.usageRecordId, row.id))
    .orderBy(asc(aiUsageConsentRecords.consentRecordId));
  return {
    id: row.id,
    status: row.status as AiUsageAttempt["status"],
    feature: row.feature,
    promptId: row.promptId,
    promptVersion: row.promptVersion,
    provider: row.provider,
    ownerSafetyId: row.ownerSafetyId,
    consentRecordIds: consentRows.map(({ consentRecordId }) => consentRecordId),
    processingAuthorityVersion: row.processingAuthorityVersion,
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

function toClientDataConsentRecord(
  row: typeof clientDataConsents.$inferSelect
): ClientDataConsentRecord {
  return {
    id: row.id,
    relationshipId: row.relationshipId,
    clientUserId: row.clientUserId,
    astrologerUserId: row.astrologerUserId,
    purpose: row.purpose,
    policyVersion: row.policyVersion,
    processorCode: row.processorCode,
    noticeLocale: row.noticeLocale,
    noticeSha256: row.noticeSha256,
    grantedAt: toIsoString(row.grantedAt),
    revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : null
  };
}
