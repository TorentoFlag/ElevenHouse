import { and, asc, desc, eq, gt, isNull, max, ne } from "drizzle-orm";
import {
  astroDiaryAstrologerReplyDraftResponseSchema,
  astroDiaryClientEntryDraftResponseSchema,
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
  astroDiaryDrafts,
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
    getJournalTimeline: (input) => getJournalTimeline(database, input),
    listParticipantJournals: (input) => listParticipantJournals(database, input),
    getParticipantJournalSummary: (input) => getParticipantJournalSummary(database, input),
    getParticipantJournalTimeline: (input) => getParticipantJournalTimeline(database, input),
    getParticipantAstrologerReplyDraft: (input) =>
      getParticipantAstrologerReplyDraft(database, input),
    getParticipantClientEntryDraft: (input) =>
      getParticipantClientEntryDraft(database, input),
    getPaidCoreCommandContext: (input) => getPaidCoreCommandContext(database, input)
  };
}

async function listAstrologerJournals(
  database: ElevenHouseDatabase,
  input: Parameters<AstroDiaryJournalReader["listAstrologerJournals"]>[0]
): Promise<AstroDiaryJournalListResponse> {
  return listParticipantJournals(database, {
    participantUserId: input.astrologerUserId,
    participantRole: "astrologer",
    limit: input.limit,
    now: input.now
  });
}

async function listParticipantJournals(
  database: ElevenHouseDatabase,
  input: Parameters<AstroDiaryJournalReader["listParticipantJournals"]>[0]
): Promise<AstroDiaryJournalListResponse> {
  return database.transaction((transaction) =>
    listParticipantJournalsInTransaction(transaction, input)
  );
}

async function listParticipantJournalsInTransaction(
  database: ClientSubscriptionTransaction,
  input: Parameters<AstroDiaryJournalReader["listParticipantJournals"]>[0]
): Promise<AstroDiaryJournalListResponse> {
  const participantColumn =
    input.participantRole === "client"
      ? astroDiaryJournals.clientUserId
      : astroDiaryJournals.astrologerUserId;
  const journalRows = await database
    .select()
    .from(astroDiaryJournals)
    .where(
      and(eq(participantColumn, input.participantUserId), ne(astroDiaryJournals.state, "erased"))
    )
    .orderBy(desc(astroDiaryJournals.createdAt), desc(astroDiaryJournals.id))
    .limit(input.limit);

  const journals = [];
  for (const journalRow of journalRows) {
    const summary = await toJournalSummary(
      database,
      journalRow,
      input.participantUserId,
      input.now
    );
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
  participantUserId: string,
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
        eq(astroDiaryReadCursors.participantUserId, participantUserId)
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
  return getParticipantJournalTimeline(database, {
    participantUserId: input.astrologerUserId,
    participantRole: "astrologer",
    journalId: input.journalId,
    afterCursor: input.afterCursor,
    limit: input.limit
  });
}

async function getParticipantJournalSummary(
  database: ElevenHouseDatabase,
  input: Parameters<AstroDiaryJournalReader["getParticipantJournalSummary"]>[0]
): Promise<AstroDiaryJournalSummaryResponse | null> {
  return database.transaction(async (transaction) => {
    const journalRow = await findParticipantJournalRow(transaction, input);
    return journalRow
      ? toJournalSummary(transaction, journalRow, input.participantUserId, input.now)
      : null;
  });
}

async function getParticipantJournalTimeline(
  database: ElevenHouseDatabase,
  input: Parameters<AstroDiaryJournalReader["getParticipantJournalTimeline"]>[0]
): Promise<AstroDiaryTimelinePage | null> {
  return database.transaction((transaction) =>
    getParticipantJournalTimelineInTransaction(transaction, input)
  );
}

async function getParticipantJournalTimelineInTransaction(
  database: ClientSubscriptionTransaction,
  input: Parameters<AstroDiaryJournalReader["getParticipantJournalTimeline"]>[0]
): Promise<AstroDiaryTimelinePage | null> {
  const journalRow = await findParticipantJournalRow(database, input);
  if (!journalRow) return null;

  const journalId = journalRow.id;

  const [cursorRow] = await database
    .select({ visibleMaxCursor: max(astroDiaryTimelineItems.cursor) })
    .from(astroDiaryTimelineItems)
    .where(eq(astroDiaryTimelineItems.journalId, journalId));
  const visibleMaxCursor = cursorRow?.visibleMaxCursor ?? 0;
  const timelineRows = await database
    .select()
    .from(astroDiaryTimelineItems)
    .where(
      and(
        eq(astroDiaryTimelineItems.journalId, journalId),
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

async function getParticipantAstrologerReplyDraft(
  database: ElevenHouseDatabase,
  input: Parameters<AstroDiaryJournalReader["getParticipantAstrologerReplyDraft"]>[0]
) {
  if (input.participantRole !== "astrologer") return null;

  return database.transaction(async (transaction) => {
    const journalRow = await findParticipantJournalRow(transaction, input);
    if (!journalRow) return null;

    const [cycle] = await transaction
      .select({ id: astroDiaryCycles.id })
      .from(astroDiaryCycles)
      .where(
        and(eq(astroDiaryCycles.journalId, journalRow.id), ne(astroDiaryCycles.state, "closed"))
      )
      .orderBy(desc(astroDiaryCycles.openedAt), desc(astroDiaryCycles.id))
      .limit(1);
    if (!cycle) return astroDiaryAstrologerReplyDraftResponseSchema.parse({ draft: null });

    const [draft] = await transaction
      .select({
        draftId: astroDiaryDrafts.id,
        version: astroDiaryDrafts.version,
        body: astroDiaryDrafts.body
      })
      .from(astroDiaryDrafts)
      .where(
        and(
          eq(astroDiaryDrafts.journalId, journalRow.id),
          eq(astroDiaryDrafts.cycleId, cycle.id),
          eq(astroDiaryDrafts.authorUserId, input.participantUserId),
          eq(astroDiaryDrafts.authorRole, "astrologer"),
          eq(astroDiaryDrafts.kind, "astrologer_reply")
        )
      )
      .orderBy(desc(astroDiaryDrafts.updatedAt), desc(astroDiaryDrafts.id))
      .limit(1);

    return astroDiaryAstrologerReplyDraftResponseSchema.parse({ draft: draft ?? null });
  });
}

async function getParticipantClientEntryDraft(
  database: ElevenHouseDatabase,
  input: Parameters<AstroDiaryJournalReader["getParticipantClientEntryDraft"]>[0]
) {
  if (input.participantRole !== "client") return null;

  return database.transaction(async (transaction) => {
    const journalRow = await findParticipantJournalRow(transaction, input);
    if (!journalRow) return null;

    const [draft] = await transaction
      .select({
        draftId: astroDiaryDrafts.id,
        version: astroDiaryDrafts.version,
        body: astroDiaryDrafts.body,
        moodId: astroDiaryDrafts.moodId
      })
      .from(astroDiaryDrafts)
      .where(
        and(
          eq(astroDiaryDrafts.journalId, journalRow.id),
          isNull(astroDiaryDrafts.cycleId),
          eq(astroDiaryDrafts.authorUserId, input.participantUserId),
          eq(astroDiaryDrafts.authorRole, "client"),
          eq(astroDiaryDrafts.kind, "client_entry")
        )
      )
      .orderBy(desc(astroDiaryDrafts.updatedAt), desc(astroDiaryDrafts.id))
      .limit(1);

    return astroDiaryClientEntryDraftResponseSchema.parse({ draft: draft ?? null });
  });
}

async function getPaidCoreCommandContext(
  database: ElevenHouseDatabase,
  input: Parameters<AstroDiaryJournalReader["getPaidCoreCommandContext"]>[0]
) {
  return database.transaction(async (transaction) => {
    const journalRow = await findParticipantJournalRow(transaction, input);
    if (!journalRow) return null;

    const [subscriptionIdentity] = await transaction
      .select({ id: clientSubscriptions.id })
      .from(clientSubscriptions)
      .where(eq(clientSubscriptions.journalEpochId, journalRow.journalEpochId))
      .limit(1);
    if (!subscriptionIdentity) return null;
    const subscription = await findClientSubscriptionById(transaction, subscriptionIdentity.id);
    if (!subscription) return null;
    const writableSubscription =
      subscription.state === "active" || subscription.state === "cancel_at_period_end";
    const currentPeriod = writableSubscription
      ? (subscription.paidPeriods.find(
          (period) =>
            Date.parse(period.startsAt) <= Date.parse(input.now) &&
            Date.parse(input.now) < Date.parse(period.endsAt) &&
            !subscription.endedPeriodIds.includes(period.id)
        ) ?? null)
      : null;
    const allowance = currentPeriod
      ? await findClientSubscriptionPeriodAllowance(transaction, currentPeriod.id)
      : null;
    const latestPeriod =
      [...subscription.paidPeriods].sort((left, right) => right.sequence - left.sequence)[0] ??
      null;
    const latestAllowance = latestPeriod
      ? await findClientSubscriptionPeriodAllowance(transaction, latestPeriod.id)
      : null;
    const [cycle] = await transaction
      .select({ id: astroDiaryCycles.id, version: astroDiaryCycles.version })
      .from(astroDiaryCycles)
      .where(
        and(eq(astroDiaryCycles.journalId, journalRow.id), ne(astroDiaryCycles.state, "closed"))
      )
      .orderBy(desc(astroDiaryCycles.openedAt), desc(astroDiaryCycles.id))
      .limit(1);
    const [obligation] = cycle
      ? await transaction
          .select({
            id: astroDiaryResponseObligations.id,
            version: astroDiaryResponseObligations.version
          })
          .from(astroDiaryResponseObligations)
          .where(
            and(
              eq(astroDiaryResponseObligations.journalId, journalRow.id),
              eq(astroDiaryResponseObligations.cycleId, cycle.id),
              ne(astroDiaryResponseObligations.state, "satisfied"),
              ne(astroDiaryResponseObligations.state, "cancelled_by_finance_revocation"),
              ne(astroDiaryResponseObligations.state, "closed_without_response")
            )
          )
          .orderBy(asc(astroDiaryResponseObligations.dueAt), asc(astroDiaryResponseObligations.id))
          .limit(1)
      : [];
    const [latestCycle] = await transaction
      .select({ id: astroDiaryCycles.id, version: astroDiaryCycles.version })
      .from(astroDiaryCycles)
      .where(eq(astroDiaryCycles.journalId, journalRow.id))
      .orderBy(desc(astroDiaryCycles.openedAt), desc(astroDiaryCycles.id))
      .limit(1);
    const [latestObligation] = latestCycle
      ? await transaction
          .select({
            id: astroDiaryResponseObligations.id,
            version: astroDiaryResponseObligations.version
          })
          .from(astroDiaryResponseObligations)
          .where(
            and(
              eq(astroDiaryResponseObligations.journalId, journalRow.id),
              eq(astroDiaryResponseObligations.cycleId, latestCycle.id)
            )
          )
          .orderBy(
            desc(astroDiaryResponseObligations.openedAt),
            desc(astroDiaryResponseObligations.id)
          )
          .limit(1)
      : [];
    return {
      journalVersion: journalRow.version,
      activePeriod:
        currentPeriod && allowance
          ? { id: currentPeriod.id, allowanceVersion: allowance.version }
          : null,
      latestPeriod:
        latestPeriod && latestAllowance
          ? { id: latestPeriod.id, allowanceVersion: latestAllowance.version }
          : null,
      currentCycle: cycle ?? null,
      currentObligation: obligation ?? null,
      latestCycle: latestCycle ?? null,
      latestObligation: latestObligation ?? null
    };
  });
}

async function findParticipantJournalRow(
  database: ClientSubscriptionTransaction,
  input: Readonly<{
    journalId: string;
    participantUserId: string;
    participantRole: "client" | "astrologer";
  }>
) {
  const participantColumn =
    input.participantRole === "client"
      ? astroDiaryJournals.clientUserId
      : astroDiaryJournals.astrologerUserId;
  const [journalRow] = await database
    .select()
    .from(astroDiaryJournals)
    .where(
      and(
        eq(astroDiaryJournals.id, input.journalId),
        eq(participantColumn, input.participantUserId),
        ne(astroDiaryJournals.state, "erased")
      )
    )
    .limit(1);
  return journalRow ?? null;
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
