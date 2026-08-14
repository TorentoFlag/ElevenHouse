import { and, asc, desc, eq, gt, max, ne } from "drizzle-orm";
import {
  astroDiaryCycleSchema,
  astroDiaryJournalListResponseSchema,
  astroDiaryJournalSchema,
  astroDiaryResponseObligationSchema,
  astroDiaryTimelineItemSchema,
  astroDiaryTimelinePageSchema,
  type AstroDiaryJournalListResponse,
  type AstroDiaryJournalSummaryResponse,
  type AstroDiaryTimelinePage
} from "@elevenhouse/contracts";
import type { AstroDiaryJournalReader } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  astroDiaryCycles,
  astroDiaryJournals,
  astroDiaryReadCursors,
  astroDiaryResponseObligations,
  astroDiaryResponseObligationWeekdays,
  astroDiaryTimelineItems,
  astroDiaryTimelineRevisionAttachments,
  clientSubscriptions
} from "../../schema";
import { findClientSubscriptionPeriodAllowance } from "../client-subscriptions/drizzle-client-subscription-allowance-uow";
import { findClientSubscriptionById } from "../client-subscriptions/drizzle-client-subscription-reader";
import type { ClientSubscriptionTransaction } from "../client-subscriptions/drizzle-client-subscription-transition-persistence";

export function createDrizzleAstroDiaryJournalReader(
  database: ElevenHouseDatabase
): AstroDiaryJournalReader {
  return {
    listAstrologerJournals: (input) => listAstrologerJournals(database, input),
    getJournalTimeline: (input) => getJournalTimeline(database, input)
  };
}

async function listAstrologerJournals(
  database: ElevenHouseDatabase,
  input: Parameters<AstroDiaryJournalReader["listAstrologerJournals"]>[0]
): Promise<AstroDiaryJournalListResponse> {
  return database.transaction((transaction) =>
    listAstrologerJournalsInTransaction(transaction, input)
  );
}

async function listAstrologerJournalsInTransaction(
  database: ClientSubscriptionTransaction,
  input: Parameters<AstroDiaryJournalReader["listAstrologerJournals"]>[0]
): Promise<AstroDiaryJournalListResponse> {
  const journalRows = await database
    .select()
    .from(astroDiaryJournals)
    .where(
      and(
        eq(astroDiaryJournals.astrologerUserId, input.astrologerUserId),
        ne(astroDiaryJournals.state, "erased")
      )
    )
    .orderBy(desc(astroDiaryJournals.createdAt), desc(astroDiaryJournals.id))
    .limit(input.limit);

  const journals = [];
  for (const journalRow of journalRows) {
    const summary = await toJournalSummary(database, journalRow, input.now);
    if (summary) {
      journals.push(summary);
    }
  }

  return astroDiaryJournalListResponseSchema.parse({
    journals,
    total: journals.length
  });
}

async function toJournalSummary(
  database: ClientSubscriptionTransaction,
  journalRow: typeof astroDiaryJournals.$inferSelect,
  now: string
): Promise<AstroDiaryJournalSummaryResponse | null> {
  const [subscriptionIdentity] = await database
    .select({ id: clientSubscriptions.id })
    .from(clientSubscriptions)
    .where(eq(clientSubscriptions.journalEpochId, journalRow.journalEpochId))
    .limit(1);
  if (!subscriptionIdentity) return null;

  const subscription = await findClientSubscriptionById(database, subscriptionIdentity.id);
  if (!subscription) return null;

  const currentPeriod =
    subscription.paidPeriods.find(
      (period) =>
        Date.parse(period.startsAt) <= Date.parse(now) &&
        Date.parse(now) < Date.parse(period.endsAt) &&
        !subscription.endedPeriodIds.includes(period.id)
    ) ?? null;
  const access =
    (subscription.state === "active" || subscription.state === "cancel_at_period_end") &&
    currentPeriod
      ? {
          mode: "active" as const,
          subscriptionId: subscription.id,
          subscriptionState: subscription.state,
          currentPeriod: {
            id: currentPeriod.id,
            sequence: currentPeriod.sequence,
            startsAt: currentPeriod.startsAt,
            endsAt: currentPeriod.endsAt
          },
          allowance: await readAllowance(database, currentPeriod.id)
        }
      : subscription.state === "ended" || subscription.state === "revoked"
        ? {
            mode: "read_only" as const,
            subscriptionId: subscription.id,
            subscriptionState: subscription.state,
            currentPeriod: null,
            allowance: null
          }
        : null;
  if (!access) return null;

  const [cycleRow] = await database
    .select()
    .from(astroDiaryCycles)
    .where(and(eq(astroDiaryCycles.journalId, journalRow.id), ne(astroDiaryCycles.state, "closed")))
    .orderBy(desc(astroDiaryCycles.openedAt), desc(astroDiaryCycles.id))
    .limit(1);
  const [obligationRow] = await database
    .select()
    .from(astroDiaryResponseObligations)
    .where(
      and(
        eq(astroDiaryResponseObligations.journalId, journalRow.id),
        ne(astroDiaryResponseObligations.state, "satisfied"),
        ne(astroDiaryResponseObligations.state, "cancelled_by_finance_revocation"),
        ne(astroDiaryResponseObligations.state, "closed_without_response")
      )
    )
    .orderBy(asc(astroDiaryResponseObligations.dueAt), asc(astroDiaryResponseObligations.id))
    .limit(1);
  const [cursorRow] = await database
    .select({ visibleMaxCursor: max(astroDiaryTimelineItems.cursor) })
    .from(astroDiaryTimelineItems)
    .where(eq(astroDiaryTimelineItems.journalId, journalRow.id));
  const visibleMaxCursor = cursorRow?.visibleMaxCursor ?? 0;
  const [readCursorRow] = await database
    .select({ lastReadCursor: astroDiaryReadCursors.lastReadCursor })
    .from(astroDiaryReadCursors)
    .where(
      and(
        eq(astroDiaryReadCursors.journalId, journalRow.id),
        eq(astroDiaryReadCursors.participantUserId, journalRow.astrologerUserId)
      )
    )
    .limit(1);
  const obligationWeekdays = obligationRow
    ? await database
        .select({ isoWeekday: astroDiaryResponseObligationWeekdays.isoWeekday })
        .from(astroDiaryResponseObligationWeekdays)
        .where(eq(astroDiaryResponseObligationWeekdays.obligationId, obligationRow.id))
        .orderBy(asc(astroDiaryResponseObligationWeekdays.isoWeekday))
    : [];

  return astroDiaryJournalListResponseSchema.shape.journals.element.parse({
    journal: astroDiaryJournalSchema.parse({
      ...journalRow,
      createdAt: journalRow.createdAt.toISOString()
    }),
    currentCycle: cycleRow
      ? astroDiaryCycleSchema.parse({
          ...cycleRow,
          clientResponseDueAt: cycleRow.clientResponseDueAt?.toISOString() ?? null,
          openedAt: cycleRow.openedAt.toISOString(),
          closedAt: cycleRow.closedAt?.toISOString() ?? null
        })
      : null,
    currentObligation: obligationRow
      ? astroDiaryResponseObligationSchema.parse({
          ...obligationRow,
          openedAt: obligationRow.openedAt.toISOString(),
          dueAt: obligationRow.dueAt.toISOString(),
          closedAt: obligationRow.closedAt?.toISOString() ?? null,
          workingWeekdays: obligationWeekdays.map((row) => row.isoWeekday)
        })
      : null,
    access,
    unreadCount: Math.max(0, visibleMaxCursor - (readCursorRow?.lastReadCursor ?? 0)),
    visibleMaxCursor
  });
}

async function getJournalTimeline(
  database: ElevenHouseDatabase,
  input: Parameters<AstroDiaryJournalReader["getJournalTimeline"]>[0]
): Promise<AstroDiaryTimelinePage | null> {
  return database.transaction((transaction) => getJournalTimelineInTransaction(transaction, input));
}

async function getJournalTimelineInTransaction(
  database: ClientSubscriptionTransaction,
  input: Parameters<AstroDiaryJournalReader["getJournalTimeline"]>[0]
): Promise<AstroDiaryTimelinePage | null> {
  const [journalRow] = await database
    .select({ id: astroDiaryJournals.id })
    .from(astroDiaryJournals)
    .where(
      and(
        eq(astroDiaryJournals.id, input.journalId),
        eq(astroDiaryJournals.astrologerUserId, input.astrologerUserId),
        ne(astroDiaryJournals.state, "erased")
      )
    )
    .limit(1);
  if (!journalRow) return null;

  const [cursorRow] = await database
    .select({ visibleMaxCursor: max(astroDiaryTimelineItems.cursor) })
    .from(astroDiaryTimelineItems)
    .where(eq(astroDiaryTimelineItems.journalId, input.journalId));
  const visibleMaxCursor = cursorRow?.visibleMaxCursor ?? 0;
  const timelineRows = await database
    .select()
    .from(astroDiaryTimelineItems)
    .where(
      and(
        eq(astroDiaryTimelineItems.journalId, input.journalId),
        gt(astroDiaryTimelineItems.cursor, input.afterCursor)
      )
    )
    .orderBy(asc(astroDiaryTimelineItems.cursor), asc(astroDiaryTimelineItems.id))
    .limit(input.limit);

  const items = [];
  for (const itemRow of timelineRows) {
    items.push(await toTimelineItem(database, itemRow));
  }
  const nextCursor = items.at(-1)?.cursor ?? null;

  return astroDiaryTimelinePageSchema.parse({
    items,
    nextCursor,
    visibleMaxCursor,
    hasMore: nextCursor !== null && nextCursor < visibleMaxCursor
  });
}

async function toTimelineItem(
  database: ClientSubscriptionTransaction,
  itemRow: typeof astroDiaryTimelineItems.$inferSelect
) {
  const base = {
    id: itemRow.id,
    journalId: itemRow.journalId,
    cycleId: itemRow.cycleId,
    authorUserId: itemRow.authorUserId,
    revision: itemRow.currentRevision,
    occurredAt: itemRow.occurredAt.toISOString(),
    cursor: itemRow.cursor
  };

  if (itemRow.kind === "tombstone") {
    return astroDiaryTimelineItemSchema.parse({
      ...base,
      kind: "tombstone",
      originalKind: itemRow.originalKind,
      authorRole: itemRow.authorRole,
      reason: itemRow.tombstoneReason
    });
  }

  const attachmentRows = await database
    .select({ mediaId: astroDiaryTimelineRevisionAttachments.mediaId })
    .from(astroDiaryTimelineRevisionAttachments)
    .where(
      and(
        eq(astroDiaryTimelineRevisionAttachments.itemId, itemRow.id),
        eq(astroDiaryTimelineRevisionAttachments.revision, itemRow.currentRevision)
      )
    )
    .orderBy(asc(astroDiaryTimelineRevisionAttachments.ordinal));

  return astroDiaryTimelineItemSchema.parse({
    ...base,
    kind: itemRow.kind,
    authorRole: itemRow.authorRole,
    body: itemRow.body,
    attachmentIds: attachmentRows.map((row) => row.mediaId),
    editedAt: itemRow.editedAt?.toISOString() ?? null,
    moodId: itemRow.moodId,
    contextStatus: itemRow.contextStatus,
    correctsItemId: itemRow.correctsItemId
  });
}

async function readAllowance(database: ClientSubscriptionTransaction, periodId: string) {
  const allowance = await findClientSubscriptionPeriodAllowance(database, periodId);
  if (!allowance) {
    throw new Error("AstroDiary current period allowance is missing");
  }

  return {
    periodId: allowance.periodId,
    total: allowance.total,
    available: allowance.available,
    reserved: allowance.reserved,
    consumed: allowance.consumed,
    released: allowance.released
  };
}
