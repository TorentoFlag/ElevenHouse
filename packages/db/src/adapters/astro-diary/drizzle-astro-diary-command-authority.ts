import { and, asc, eq, max } from "drizzle-orm";
import {
  astroDiaryCycleSchema,
  astroDiaryDraftSchema,
  astroDiaryJournalSchema,
  astroDiaryResponseObligationSchema,
  astroDiaryTimelineItemSchema
} from "@elevenhouse/contracts";
import type {
  AstroDiaryCommandAuthority,
  AstroDiaryCommandPrecondition
} from "@elevenhouse/domain";
import { z } from "@elevenhouse/validation";

import type { ClientSubscriptionTransaction } from "../client-subscriptions/drizzle-client-subscription-transition-persistence";
import { findClientSubscriptionPeriodAllowance } from "../client-subscriptions/drizzle-client-subscription-allowance-uow";
import { findClientSubscriptionById } from "../client-subscriptions/drizzle-client-subscription-reader";
import { clientAstrologerRelationships } from "../../schema/clients/client-astrologer-relationships.schema";
import { clientEntitlementGrants, clientSubscriptions } from "../../schema/client-subscriptions";
import {
  astroDiaryCascadeReceipts,
  astroDiaryCascadeTargets,
  astroDiaryDerivativeRedactionReceipts,
  astroDiaryDraftAttachments,
  astroDiaryDrafts,
  astroDiaryErasureCommands,
  astroDiaryJournals,
  astroDiaryMediaAuthorities,
  astroDiaryReadCursors,
  astroDiaryResponseObligations,
  astroDiaryResponseObligationWeekdays,
  astroDiaryTimelineItems,
  astroDiaryCycles,
  astroDiaryTimelineRevisionAttachments
} from "../../schema/astro-diary";

const relationshipStateSchema = z.enum(["active", "archived", "blocked"]);
const entitlementStateSchema = z.enum(["active", "ended", "revoked"]);
const digestSchema = z.custom<`sha256:${string}`>(
  (value): value is `sha256:${string}` =>
    typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)
);
const cascadeSubsystemSchema = z.enum([
  "timeline_revision",
  "derivative",
  "transcript",
  "extraction",
  "embedding",
  "ai_draft",
  "export",
  "media"
]);

export type LockedAstroDiaryCommandAuthority = Readonly<{
  authority: AstroDiaryCommandAuthority;
  preconditionVersions: ReadonlyMap<string, number>;
}>;

export async function readLockedAstroDiaryCommandAuthority(
  transaction: ClientSubscriptionTransaction,
  journalId: string,
  commandAt: Date
): Promise<LockedAstroDiaryCommandAuthority | null> {
  const [journalRow] = await transaction
    .select()
    .from(astroDiaryJournals)
    .where(eq(astroDiaryJournals.id, journalId))
    .limit(1)
    .for("update");
  if (!journalRow) return null;

  const [relationship] = await transaction
    .select()
    .from(clientAstrologerRelationships)
    .where(eq(clientAstrologerRelationships.id, journalRow.relationshipId))
    .limit(1)
    .for("share");
  if (!relationship) throw new Error("AstroDiary journal relationship authority is missing");

  const [subscriptionIdentity] = await transaction
    .select({ id: clientSubscriptions.id })
    .from(clientSubscriptions)
    .where(
      and(
        eq(clientSubscriptions.journalEpochId, journalRow.journalEpochId),
        eq(clientSubscriptions.relationshipId, journalRow.relationshipId)
      )
    )
    .limit(1)
    .for("update");
  if (!subscriptionIdentity) {
    throw new Error("AstroDiary journal subscription authority is missing");
  }
  const subscription = await findClientSubscriptionById(
    transaction,
    subscriptionIdentity.id,
    "update"
  );
  if (!subscription) throw new Error("Locked AstroDiary subscription authority disappeared");

  const entitlementRows = await transaction
    .select()
    .from(clientEntitlementGrants)
    .where(
      and(
        eq(clientEntitlementGrants.subscriptionId, subscription.id),
        eq(clientEntitlementGrants.journalEpochId, journalRow.journalEpochId),
        eq(clientEntitlementGrants.capability, "astro_diary")
      )
    )
    .orderBy(asc(clientEntitlementGrants.startsAt))
    .for("share");

  const cycleRows = await transaction
    .select()
    .from(astroDiaryCycles)
    .where(eq(astroDiaryCycles.journalId, journalId))
    .orderBy(asc(astroDiaryCycles.openedAt), asc(astroDiaryCycles.id))
    .for("update");
  const draftRows = await transaction
    .select()
    .from(astroDiaryDrafts)
    .where(eq(astroDiaryDrafts.journalId, journalId))
    .orderBy(asc(astroDiaryDrafts.updatedAt), asc(astroDiaryDrafts.id))
    .for("update");
  const timelineRows = await transaction
    .select()
    .from(astroDiaryTimelineItems)
    .where(eq(astroDiaryTimelineItems.journalId, journalId))
    .orderBy(asc(astroDiaryTimelineItems.cursor), asc(astroDiaryTimelineItems.id))
    .for("update");
  const obligationRows = await transaction
    .select()
    .from(astroDiaryResponseObligations)
    .where(eq(astroDiaryResponseObligations.journalId, journalId))
    .orderBy(asc(astroDiaryResponseObligations.openedAt), asc(astroDiaryResponseObligations.id))
    .for("update");
  const readCursorRows = await transaction
    .select()
    .from(astroDiaryReadCursors)
    .where(eq(astroDiaryReadCursors.journalId, journalId))
    .orderBy(asc(astroDiaryReadCursors.participantUserId))
    .for("update");
  const mediaRows = await transaction
    .select()
    .from(astroDiaryMediaAuthorities)
    .where(eq(astroDiaryMediaAuthorities.journalId, journalId))
    .orderBy(asc(astroDiaryMediaAuthorities.createdAt), asc(astroDiaryMediaAuthorities.mediaId))
    .for("update");
  const erasureCommandRows = await transaction
    .select()
    .from(astroDiaryErasureCommands)
    .where(eq(astroDiaryErasureCommands.journalId, journalId))
    .orderBy(asc(astroDiaryErasureCommands.requestedAt), asc(astroDiaryErasureCommands.id))
    .for("update");

  const draftAttachmentRows = await transaction
    .select()
    .from(astroDiaryDraftAttachments)
    .where(eq(astroDiaryDraftAttachments.journalId, journalId))
    .orderBy(asc(astroDiaryDraftAttachments.draftId), asc(astroDiaryDraftAttachments.ordinal));
  const timelineAttachmentRows = await transaction
    .select()
    .from(astroDiaryTimelineRevisionAttachments)
    .where(eq(astroDiaryTimelineRevisionAttachments.journalId, journalId))
    .orderBy(
      asc(astroDiaryTimelineRevisionAttachments.itemId),
      asc(astroDiaryTimelineRevisionAttachments.revision),
      asc(astroDiaryTimelineRevisionAttachments.ordinal)
    );
  const weekdayRows = await transaction
    .select()
    .from(astroDiaryResponseObligationWeekdays)
    .innerJoin(
      astroDiaryResponseObligations,
      eq(astroDiaryResponseObligations.id, astroDiaryResponseObligationWeekdays.obligationId)
    )
    .where(eq(astroDiaryResponseObligations.journalId, journalId))
    .orderBy(
      asc(astroDiaryResponseObligationWeekdays.obligationId),
      asc(astroDiaryResponseObligationWeekdays.isoWeekday)
    );
  const redactionRows = await transaction
    .select({ receipt: astroDiaryDerivativeRedactionReceipts })
    .from(astroDiaryDerivativeRedactionReceipts)
    .innerJoin(
      astroDiaryErasureCommands,
      eq(astroDiaryErasureCommands.id, astroDiaryDerivativeRedactionReceipts.commandId)
    )
    .where(eq(astroDiaryErasureCommands.journalId, journalId))
    .orderBy(asc(astroDiaryDerivativeRedactionReceipts.completedAt));
  const cascadeTargetRows = await transaction
    .select()
    .from(astroDiaryCascadeTargets)
    .where(eq(astroDiaryCascadeTargets.journalId, journalId))
    .orderBy(
      asc(astroDiaryCascadeTargets.cascadeRequestId),
      asc(astroDiaryCascadeTargets.subsystem),
      asc(astroDiaryCascadeTargets.targetId)
    );
  const cascadeReceiptRows = await transaction
    .select()
    .from(astroDiaryCascadeReceipts)
    .where(eq(astroDiaryCascadeReceipts.journalId, journalId))
    .orderBy(asc(astroDiaryCascadeReceipts.completedAt), asc(astroDiaryCascadeReceipts.receiptId));

  const activePeriod =
    subscription.paidPeriods.find(
      (period) =>
        Date.parse(period.startsAt) <= commandAt.getTime() &&
        commandAt.getTime() < Date.parse(period.endsAt) &&
        !subscription.endedPeriodIds.includes(period.id)
    ) ?? null;
  const entitlement =
    (activePeriod
      ? entitlementRows.find((row) => row.periodId === activePeriod.id)
      : entitlementRows.at(-1)) ?? null;

  const allowances = [];
  for (const period of subscription.paidPeriods) {
    const allowance = await findClientSubscriptionPeriodAllowance(transaction, period.id, "update");
    if (!allowance) {
      throw new Error("AstroDiary subscription period allowance authority is missing");
    }
    allowances.push(allowance);
  }

  const journal = astroDiaryJournalSchema.parse({
    id: journalRow.id,
    relationshipId: journalRow.relationshipId,
    journalEpochId: journalRow.journalEpochId,
    astrologerUserId: journalRow.astrologerUserId,
    clientUserId: journalRow.clientUserId,
    state: journalRow.state,
    version: journalRow.version,
    createdAt: journalRow.createdAt.toISOString()
  });
  const cycles = cycleRows.map((row) =>
    astroDiaryCycleSchema.parse({
      id: row.id,
      journalId: row.journalId,
      openingPeriodId: row.openingPeriodId,
      openingAllowanceReservationId: row.openingAllowanceReservationId,
      awaitingClientPromptItemId: row.awaitingClientPromptItemId,
      clientResponseDueAt: row.clientResponseDueAt?.toISOString() ?? null,
      clientResponseWindowCalendarDays: row.clientResponseWindowCalendarDays,
      clientResponseTimezone: row.clientResponseTimezone,
      state: row.state,
      version: row.version,
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      closeReason: row.closeReason
    })
  );
  const drafts = draftRows.map((row) =>
    astroDiaryDraftSchema.parse({
      id: row.id,
      journalId: row.journalId,
      cycleId: row.cycleId,
      authorUserId: row.authorUserId,
      authorRole: row.authorRole,
      kind: row.kind,
      version: row.version,
      body: row.body,
      attachmentIds: draftAttachmentRows
        .filter((attachment) => attachment.draftId === row.id)
        .map((attachment) => attachment.mediaId),
      moodId: row.moodId,
      correctsItemId: row.correctsItemId,
      updatedAt: row.updatedAt.toISOString()
    })
  );
  const timelineItems = timelineRows.map((row) =>
    astroDiaryTimelineItemSchema.parse(
      row.kind === "tombstone"
        ? {
            id: row.id,
            journalId: row.journalId,
            cycleId: row.cycleId,
            authorUserId: row.authorUserId,
            authorRole: row.authorRole,
            revision: row.currentRevision,
            occurredAt: row.occurredAt.toISOString(),
            cursor: row.cursor,
            kind: "tombstone",
            originalKind: row.originalKind,
            reason: row.tombstoneReason
          }
        : {
            id: row.id,
            journalId: row.journalId,
            cycleId: row.cycleId,
            authorUserId: row.authorUserId,
            authorRole: row.authorRole,
            revision: row.currentRevision,
            occurredAt: row.occurredAt.toISOString(),
            cursor: row.cursor,
            kind: row.kind,
            body: row.body,
            moodId: row.moodId,
            contextStatus: row.contextStatus,
            correctsItemId: row.correctsItemId,
            editedAt: row.editedAt?.toISOString() ?? null,
            attachmentIds: timelineAttachmentRows
              .filter(
                (attachment) =>
                  attachment.itemId === row.id && attachment.revision === row.currentRevision
              )
              .map((attachment) => attachment.mediaId)
          }
    )
  );
  const obligations = obligationRows.map((row) =>
    astroDiaryResponseObligationSchema.parse({
      id: row.id,
      journalId: row.journalId,
      cycleId: row.cycleId,
      triggerItemId: row.triggerItemId,
      state: row.state,
      version: row.version,
      openedAt: row.openedAt.toISOString(),
      dueAt: row.dueAt.toISOString(),
      responseSlaWorkingDays: row.responseSlaWorkingDays,
      workingWeekdays: weekdayRows
        .filter(
          ({ astro_diary_response_obligation_weekdays: weekday }) => weekday.obligationId === row.id
        )
        .map(({ astro_diary_response_obligation_weekdays: weekday }) => weekday.isoWeekday),
      serviceTimezone: row.serviceTimezone,
      resolvedDueLocal: row.resolvedDueLocal,
      resolvedDueOffset: row.resolvedDueOffset,
      satisfiedByItemId: row.satisfiedByItemId,
      closedAt: row.closedAt?.toISOString() ?? null
    })
  );
  const media = mediaRows.map((row) => ({
    id: row.mediaId,
    ownerUserId: row.ownerUserId,
    journalId: row.journalId,
    status:
      row.state === "pending"
        ? ("uploading" as const)
        : row.state === "ready" || row.state === "bound"
          ? ("ready" as const)
          : row.state === "failed"
            ? ("failed" as const)
            : ("deleted" as const),
    visibility: "private" as const,
    purpose: z.enum(["astro_diary_attachment", "astro_diary_voice"]).parse(row.purpose),
    boundItemId: row.boundItemId
  }));
  const cascadeTargets = cascadeTargetRows.map((row) => ({
    cascadeRequestId: row.cascadeRequestId,
    journalId: row.journalId,
    subsystem: cascadeSubsystemSchema.parse(row.subsystem),
    targetId: row.targetId,
    sourceVersion: row.sourceVersion,
    sourceDigest: digestSchema.parse(row.sourceDigest)
  }));
  const [cursorMaximum] = await transaction
    .select({ value: max(astroDiaryTimelineItems.cursor) })
    .from(astroDiaryTimelineItems)
    .where(eq(astroDiaryTimelineItems.journalId, journalId));

  const preconditionVersions = new Map<string, number>();
  preconditionVersions.set(
    preconditionKey({ aggregate: "journal", id: journal.id }),
    journal.version
  );
  for (const cycle of cycles) {
    preconditionVersions.set(preconditionKey({ aggregate: "cycle", id: cycle.id }), cycle.version);
  }
  for (const draft of drafts) {
    preconditionVersions.set(preconditionKey({ aggregate: "draft", id: draft.id }), draft.version);
  }
  for (const item of timelineItems) {
    preconditionVersions.set(
      preconditionKey({ aggregate: "timeline_item", id: item.id }),
      item.revision
    );
  }
  for (const obligation of obligations) {
    preconditionVersions.set(
      preconditionKey({ aggregate: "obligation", id: obligation.id }),
      obligation.version
    );
  }
  for (const allowance of allowances) {
    preconditionVersions.set(
      preconditionKey({ aggregate: "allowance", id: allowance.periodId }),
      allowance.version
    );
  }
  for (const cursor of readCursorRows) {
    preconditionVersions.set(
      preconditionKey({ aggregate: "read_cursor", id: cursor.participantUserId }),
      cursor.version
    );
  }

  const relationshipState = relationshipStateSchema.parse(relationship.status);
  const entitlementState = entitlement
    ? entitlementStateSchema.parse(entitlement.state)
    : subscription.state === "revoked"
      ? ("revoked" as const)
      : ("ended" as const);
  return {
    authority: {
      access: {
        relationshipState,
        entitlementState,
        financeDenied: entitlementState === "revoked" || subscription.state === "revoked",
        journalState: journal.state,
        hasOpenCycle: cycles.some((cycle) => cycle.state !== "closed"),
        hasOpenResponseObligation: obligations.some(
          (obligation) => obligation.state === "open" || obligation.state === "overdue"
        )
      },
      subscription,
      contract: subscription.contract,
      activePeriod,
      commandAt: commandAt.toISOString(),
      journal,
      cycles,
      drafts,
      obligations,
      allowances,
      timelineItems,
      visibleMaxCursor: cursorMaximum?.value ?? 0,
      readCursors: readCursorRows.map((cursor) => ({
        journalId: cursor.journalId,
        participantUserId: cursor.participantUserId,
        lastReadCursor: cursor.lastReadCursor,
        version: cursor.version,
        updatedAt: cursor.updatedAt.toISOString()
      })),
      media,
      erasureAuthority: {
        commands: erasureCommandRows.map((row) => ({
          commandId: row.id,
          targetType: z.enum(["item", "journal"]).parse(row.targetType),
          targetId: row.targetId,
          state: z.enum(["pending", "completed"]).parse(row.state),
          sourceVersion: row.sourceVersion,
          sourceDigest: row.sourceDigest === null ? null : digestSchema.parse(row.sourceDigest),
          derivativeCommandId: row.derivativeCommandId,
          cascadeRequestId: row.cascadeRequestId,
          requestedAt: row.requestedAt.toISOString()
        })),
        redactionReceipts: redactionRows.map(({ receipt }) => ({
          receiptId: receipt.id,
          commandId: receipt.commandId,
          target: z.enum(["source", "derivative", "media"]).parse(receipt.target),
          mediaId: receipt.mediaId
        })),
        cascadeInventory: cascadeTargets.map(
          ({ subsystem, targetId, sourceVersion, sourceDigest }) => ({
            subsystem,
            targetId,
            sourceVersion,
            sourceDigest
          })
        ),
        cascadeTargets,
        cascadeReceipts: cascadeReceiptRows.map((row) => ({
          receiptId: row.receiptId,
          cascadeRequestId: row.cascadeRequestId,
          journalId: row.journalId,
          subsystem: cascadeSubsystemSchema.parse(row.subsystem),
          targetId: row.targetId,
          sourceVersion: row.sourceVersion,
          sourceDigest: digestSchema.parse(row.sourceDigest),
          completedAt: row.completedAt.toISOString()
        }))
      }
    },
    preconditionVersions
  };
}

export function preconditionKey(
  precondition: Pick<AstroDiaryCommandPrecondition, "aggregate" | "id">
): string {
  return `${precondition.aggregate}:${precondition.id}`;
}
