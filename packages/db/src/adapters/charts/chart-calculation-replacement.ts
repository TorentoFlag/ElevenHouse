import { and, count, eq, ne } from "drizzle-orm";
import {
  chartResultSchema,
  chartSettingsSchema,
  type ChartExecutionProfile
} from "@elevenhouse/contracts";
import {
  assertStoredChartCalculationIntegrity,
  CALCULATION_PDF_DELETE_REQUESTED_EVENT,
  ChartCalculationReplacementError,
  type CalculationMode,
  type CalculationModule,
  type CalculationParticipant
} from "@elevenhouse/domain";
import { z } from "@elevenhouse/validation";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  calculationArtifacts,
  calculationClientLinks,
  calculationInterpretations,
  calculationParticipants,
  calculationPdfJobs,
  calculationRecords,
  outboxEvents
} from "../../schema";
import { lockCalculationExactKey } from "../calculations/calculation-exact-key";

export type CalculationReplacementTransaction = Parameters<
  Parameters<ElevenHouseDatabase["transaction"]>[0]
>[0];

export type ReplaceCalculationResultWithInvalidationInput = {
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly expectedModule: CalculationModule;
  readonly replacementMode: CalculationMode;
  readonly expectedMethodCode: string;
  readonly expectedSourceChecksum: string;
  readonly title?: string;
  readonly participants: readonly CalculationParticipant[];
  readonly requestFingerprint: string;
  readonly inputData: unknown;
  readonly resultData: unknown;
  readonly resultSummary: unknown;
  readonly resultChecksum: string;
  readonly expectedExecutionProfile: ChartExecutionProfile;
  readonly now: Date;
};

export type ReplaceCalculationResultWithInvalidationOutcome =
  | { readonly kind: "replaced"; readonly calculationId: string }
  | { readonly kind: "not_found" }
  | { readonly kind: "source_changed" }
  | { readonly kind: "target_mismatch" }
  | { readonly kind: "participant_mismatch" }
  | { readonly kind: "exact_key_conflict" };

type CalculationRecordRow = typeof calculationRecords.$inferSelect;
type CalculationParticipantRow = typeof calculationParticipants.$inferSelect;
const relationshipSnapshotSchema = z
  .object({
    primaryClientId: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
    partnerClientId: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase())
  })
  .strict();
const legacyRelationshipInputEnvelopeSchema = z
  .object({
    inputSnapshot: z
      .object({
        inputSnapshot: z.unknown(),
        partnerInputSnapshot: z.unknown(),
        relationshipSnapshot: relationshipSnapshotSchema
      })
      .strict(),
    settings: chartSettingsSchema
  })
  .strict();

export async function replaceCalculationResultWithInvalidation(
  database: CalculationReplacementTransaction,
  input: ReplaceCalculationResultWithInvalidationInput
): Promise<ReplaceCalculationResultWithInvalidationOutcome> {
  await lockCalculationExactKey(database, {
    ownerUserId: input.ownerUserId,
    module: input.expectedModule,
    mode: input.replacementMode,
    methodCode: input.expectedMethodCode,
    requestFingerprint: input.requestFingerprint
  });
  const [target] = await database
    .select()
    .from(calculationRecords)
    .where(
      and(
        eq(calculationRecords.ownerUserId, input.ownerUserId),
        eq(calculationRecords.id, input.calculationId),
        ne(calculationRecords.status, "archived")
      )
    )
    .limit(1)
    .for("update");
  if (!target) return { kind: "not_found" };
  if (!targetIdentityMatches(target, input)) return { kind: "target_mismatch" };
  if (target.resultChecksum !== input.expectedSourceChecksum) {
    return { kind: "source_changed" };
  }

  const participantRows = await database
    .select()
    .from(calculationParticipants)
    .where(eq(calculationParticipants.calculationId, target.id))
    .orderBy(calculationParticipants.order)
    .for("update");
  const legacyRelationshipRepair = isLegacyRelationshipRepair(
    target,
    participantRows,
    input.participants,
    input
  );
  if (!legacyRelationshipRepair && target.mode !== input.replacementMode) {
    return { kind: "target_mismatch" };
  }
  if (
    !legacyRelationshipRepair &&
    !participantIdentityMatches(participantRows, input.participants)
  ) {
    return { kind: "participant_mismatch" };
  }

  const [collision] = await database
    .select({ id: calculationRecords.id })
    .from(calculationRecords)
    .where(
      and(
        eq(calculationRecords.ownerUserId, target.ownerUserId),
        eq(calculationRecords.module, target.module),
        eq(calculationRecords.mode, input.replacementMode),
        eq(calculationRecords.methodCode, target.methodCode),
        eq(calculationRecords.requestFingerprint, input.requestFingerprint),
        ne(calculationRecords.status, "archived"),
        ne(calculationRecords.id, target.id)
      )
    )
    .limit(1)
    .for("share");
  if (collision) return { kind: "exact_key_conflict" };

  try {
    assertStoredChartCalculationIntegrity({
      calculation: {
        module: input.expectedModule,
        methodCode: input.expectedMethodCode,
        inputData: input.inputData,
        resultData: input.resultData,
        resultChecksum: input.resultChecksum
      },
      expectedExecutionProfile: input.expectedExecutionProfile
    });
  } catch {
    throw new ChartCalculationReplacementError("CHART_REPLACEMENT_RESULT_INTEGRITY_INVALID");
  }

  for (const [order, participant] of input.participants.entries()) {
    if (legacyRelationshipRepair && order === 1) {
      await database.insert(calculationParticipants).values({
        calculationId: target.id,
        role: participant.role,
        source: participant.source,
        clientId: participant.clientId,
        displayName: participant.displayName,
        order,
        createdAt: input.now,
        updatedAt: input.now
      });
      continue;
    }
    await database
      .update(calculationParticipants)
      .set({ displayName: participant.displayName, updatedAt: input.now })
      .where(
        and(
          eq(calculationParticipants.calculationId, target.id),
          eq(calculationParticipants.order, order)
        )
      );
  }

  await schedulePrivatePdfCleanup(database, target.id, input.now);
  await database
    .update(calculationClientLinks)
    .set({
      visibility: "private_to_astrologer",
      publishedAt: null,
      publishedInterpretationId: null,
      publishedResultChecksum: null,
      updatedAt: input.now
    })
    .where(eq(calculationClientLinks.calculationId, target.id));
  await database
    .delete(calculationInterpretations)
    .where(eq(calculationInterpretations.calculationId, target.id));
  await database.delete(calculationPdfJobs).where(eq(calculationPdfJobs.calculationId, target.id));
  await database
    .delete(calculationArtifacts)
    .where(eq(calculationArtifacts.calculationId, target.id));
  const [linkCount] = await database
    .select({ value: count() })
    .from(calculationClientLinks)
    .where(eq(calculationClientLinks.calculationId, target.id));
  const [updated] = await database
    .update(calculationRecords)
    .set({
      ...(input.title === undefined ? {} : { title: input.title }),
      mode: input.replacementMode,
      requestFingerprint: input.requestFingerprint,
      inputData: input.inputData,
      resultData: input.resultData,
      resultSummary: input.resultSummary,
      resultChecksum: input.resultChecksum,
      status: Number(linkCount?.value ?? 0) > 0 ? "linked" : "calculated",
      updatedAt: input.now
    })
    .where(
      and(
        eq(calculationRecords.ownerUserId, input.ownerUserId),
        eq(calculationRecords.id, input.calculationId),
        eq(calculationRecords.module, input.expectedModule),
        eq(calculationRecords.mode, target.mode),
        eq(calculationRecords.methodCode, input.expectedMethodCode),
        eq(calculationRecords.resultChecksum, input.expectedSourceChecksum),
        ne(calculationRecords.status, "archived")
      )
    )
    .returning({ id: calculationRecords.id });
  return updated ? { kind: "replaced", calculationId: updated.id } : { kind: "source_changed" };
}

async function schedulePrivatePdfCleanup(
  database: CalculationReplacementTransaction,
  calculationId: string,
  now: Date
): Promise<void> {
  const pdfArtifacts = await database
    .select({ mediaAssetId: calculationArtifacts.mediaAssetId })
    .from(calculationArtifacts)
    .where(
      and(
        eq(calculationArtifacts.calculationId, calculationId),
        eq(calculationArtifacts.artifactType, "pdf")
      )
    );
  const mediaAssetIds = [...new Set(pdfArtifacts.map((artifact) => artifact.mediaAssetId))];
  if (mediaAssetIds.length === 0) return;
  const availableAt = new Date(now.getTime() + 60 * 60 * 1_000);
  await database
    .insert(outboxEvents)
    .values(
      mediaAssetIds.map((mediaAssetId) => ({
        eventType: CALCULATION_PDF_DELETE_REQUESTED_EVENT,
        aggregateId: mediaAssetId,
        payload: { mediaAssetId },
        status: "pending" as const,
        attempts: 0,
        availableAt,
        createdAt: now,
        updatedAt: now
      }))
    )
    .onConflictDoNothing({ target: [outboxEvents.eventType, outboxEvents.aggregateId] });
}

function targetIdentityMatches(
  target: CalculationRecordRow,
  input: ReplaceCalculationResultWithInvalidationInput
): boolean {
  return target.module === input.expectedModule && target.methodCode === input.expectedMethodCode;
}

function participantIdentityMatches(
  rows: readonly CalculationParticipantRow[],
  participants: readonly CalculationParticipant[]
): boolean {
  return (
    rows.length === participants.length &&
    rows.every((row, order) => {
      const participant = participants[order];
      return (
        participant !== undefined &&
        row.order === order &&
        row.role === participant.role &&
        row.source === participant.source &&
        row.clientId === participant.clientId
      );
    })
  );
}

function isLegacyRelationshipRepair(
  target: CalculationRecordRow,
  rows: readonly CalculationParticipantRow[],
  participants: readonly CalculationParticipant[],
  input: ReplaceCalculationResultWithInvalidationInput
): boolean {
  const subject = participants[0];
  const partner = participants[1];
  const storedInput = legacyRelationshipInputEnvelopeSchema.safeParse(target.inputData);
  const storedResult = chartResultSchema.safeParse(target.resultData);
  if (
    !storedInput.success ||
    !storedResult.success ||
    storedResult.data.schemaVersion !== "chart-result.v1" ||
    (storedResult.data.method !== "synastry" && storedResult.data.method !== "composite") ||
    storedResult.data.method !== input.expectedMethodCode
  ) {
    return false;
  }
  const inputRelationship = storedInput.data.inputSnapshot.relationshipSnapshot;
  const resultRelationship = storedResult.data.relationshipSnapshot;
  const resultPrimaryClientId = resultRelationship.primaryClientId.toLowerCase();
  const resultPartnerClientId = resultRelationship.partnerClientId.toLowerCase();
  return (
    input.expectedModule === "chart" &&
    target.mode === "individual" &&
    input.replacementMode === "compatibility" &&
    (input.expectedMethodCode === "synastry" || input.expectedMethodCode === "composite") &&
    rows.length === 1 &&
    participantIdentityMatches(rows, subject ? [subject] : []) &&
    subject?.role === "subject" &&
    subject.source === "crm_client" &&
    subject.clientId !== null &&
    subject.displayName.trim().length > 0 &&
    partner?.role === "partner" &&
    partner.source === "crm_client" &&
    partner.clientId !== null &&
    partner.clientId !== subject.clientId &&
    partner.displayName.trim().length > 0 &&
    inputRelationship.primaryClientId !== inputRelationship.partnerClientId &&
    inputRelationship.primaryClientId === resultPrimaryClientId &&
    inputRelationship.partnerClientId === resultPartnerClientId &&
    inputRelationship.primaryClientId === subject.clientId &&
    inputRelationship.partnerClientId === partner.clientId
  );
}
