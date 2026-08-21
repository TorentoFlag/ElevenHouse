import {
  clientReviewableInstanceListQuerySchema,
  clientReviewableInstanceListResponseSchema,
  clientReviewDetailSchema,
  reviewAdminDetailSchema,
  reviewAstrologerListQuerySchema,
  reviewAstrologerListResponseSchema,
  reviewModerationCaseDetailSchema,
  reviewModerationQueueQuerySchema,
  reviewModerationQueueResponseSchema,
  reviewPublicListQuerySchema,
  reviewPublicListResponseSchema,
  type ReviewAdminAuthor,
  type ReviewAdminAuditEntry,
  type ReviewAstrologerItem,
  type ReviewAstrologerListQuery,
  type ClientReviewableInstanceListQuery,
  type ReviewModerationCaseMessage,
  type ReviewModerationCaseSummary,
  type ReviewModerationQueueItem,
  type ReviewPublicItem,
  type ReviewPublicIdentityMode,
  type ReviewPublicListQuery,
  type ReviewReplyVersion,
  type ReviewVersion,
  type ReviewableInstanceSummary
} from "@elevenhouse/contracts";
import { buildReviewPublicAuthor, type ReviewReadStore } from "@elevenhouse/domain";
import { and, asc, desc, eq, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  auditLogEntries,
  reviewModerationCases,
  reviewModerationCaseMessages,
  reviewReplyVersions,
  reviewVersions,
  reviewableInstances,
  reviews,
  userProfiles
} from "../../schema";

type ReviewRow = typeof reviews.$inferSelect;
type ReviewVersionRow = typeof reviewVersions.$inferSelect;
type ReviewReplyVersionRow = typeof reviewReplyVersions.$inferSelect;
type ReviewableInstanceRow = typeof reviewableInstances.$inferSelect;
type ReviewModerationCaseRow = typeof reviewModerationCases.$inferSelect;
type ReviewModerationCaseMessageRow = typeof reviewModerationCaseMessages.$inferSelect;
type AuditLogEntryRow = typeof auditLogEntries.$inferSelect;
type UserProfileRow = typeof userProfiles.$inferSelect;

type PublicReviewRow = {
  readonly review: ReviewRow;
  readonly reviewableInstance: ReviewableInstanceRow;
  readonly activeVersion: ReviewVersionRow;
  readonly activeReplyVersion: ReviewReplyVersionRow | null;
  readonly clientProfile: UserProfileRow | null;
};

type PublicReviewCursor = {
  readonly publishedAt: string;
  readonly reviewId: string;
};
type ModerationQueueCursor = {
  readonly submittedAt: string;
  readonly queueItemId: string;
};
type ClientReviewableInstanceCursor = {
  readonly receivedAt: string;
  readonly reviewableInstanceId: string;
};
type AstrologerReviewCursor = {
  readonly updatedAt: string;
  readonly reviewId: string;
};

const publicCursorVersion = "reviews_public_v1";
const moderationQueueCursorVersion = "reviews_moderation_queue_v1";
const clientReviewableInstanceCursorVersion = "reviews_client_instances_v1";
const astrologerReviewCursorVersion = "reviews_astrologer_v1";

export function createDrizzleReviewReadStore(database: ElevenHouseDatabase): ReviewReadStore {
  return {
    listPublicReviews: (query) => listPublicReviews(database, query),
    listClientReviewableInstances: (query) => listClientReviewableInstances(database, query),
    listAstrologerReviews: (query) => listAstrologerReviews(database, query),
    listModerationQueue: (query) => listModerationQueue(database, query),
    getClientReviewDetail: (input) => getClientReviewDetail(database, input),
    getAdminReviewDetail: (input) => getAdminReviewDetail(database, input),
    getModerationCaseDetail: (input) => getModerationCaseDetail(database, input)
  };
}

async function listModerationQueue(
  database: ElevenHouseDatabase,
  input: Parameters<ReviewReadStore["listModerationQueue"]>[0]
): Promise<Awaited<ReturnType<ReviewReadStore["listModerationQueue"]>>> {
  const query = reviewModerationQueueQuerySchema.parse(input);
  const cursor = query.cursor ? parseModerationQueueCursor(query.cursor) : null;
  if (query.cursor && !cursor) return { items: [], nextCursor: null };

  const reviewVersionConditions: SQL[] = [
    eq(reviewVersions.moderationStatus, "pending"),
    eq(reviews.pendingVersionId, reviewVersions.id)
  ];
  const replyVersionConditions: SQL[] = [
    eq(reviewReplyVersions.moderationStatus, "pending"),
    eq(reviews.pendingReplyVersionId, reviewReplyVersions.id)
  ];
  if (cursor) {
    reviewVersionConditions.push(
      moderationQueueCursorCondition(
        reviewVersions.submittedAt,
        sql<string>`'review_version:' || ${reviewVersions.id}`,
        cursor
      )
    );
    replyVersionConditions.push(
      moderationQueueCursorCondition(
        reviewReplyVersions.submittedAt,
        sql<string>`'reply_version:' || ${reviewReplyVersions.id}`,
        cursor
      )
    );
  }
  const moderationCaseConditions: SQL[] = [
    inArray(reviewModerationCases.status, [
      "open",
      "waiting_client",
      "waiting_astrologer",
      "consensus_reached"
    ])
  ];
  if (cursor) {
    moderationCaseConditions.push(
      moderationQueueCursorCondition(
        reviewModerationCases.openedAt,
        sql<string>`'moderation_case:' || ${reviewModerationCases.id}`,
        cursor
      )
    );
  }

  const pendingReviewVersions = await database
    .select({
      review: reviews,
      reviewableInstance: reviewableInstances,
      version: reviewVersions,
      clientProfile: userProfiles
    })
    .from(reviewVersions)
    .innerJoin(reviews, eq(reviews.id, reviewVersions.reviewId))
    .innerJoin(reviewableInstances, eq(reviewableInstances.id, reviews.reviewableInstanceId))
    .leftJoin(userProfiles, eq(userProfiles.userId, reviews.clientUserId))
    .where(and(...reviewVersionConditions))
    .orderBy(desc(reviewVersions.submittedAt), desc(reviewVersions.id))
    .limit(query.limit + 1);

  const pendingReplyVersions = await database
    .select({
      review: reviews,
      reviewableInstance: reviewableInstances,
      replyVersion: reviewReplyVersions,
      clientProfile: userProfiles
    })
    .from(reviewReplyVersions)
    .innerJoin(reviews, eq(reviews.id, reviewReplyVersions.reviewId))
    .innerJoin(reviewableInstances, eq(reviewableInstances.id, reviews.reviewableInstanceId))
    .leftJoin(userProfiles, eq(userProfiles.userId, reviews.clientUserId))
    .where(and(...replyVersionConditions))
    .orderBy(desc(reviewReplyVersions.submittedAt), desc(reviewReplyVersions.id))
    .limit(query.limit + 1);

  const openModerationCases = await database
    .select({
      review: reviews,
      reviewableInstance: reviewableInstances,
      moderationCase: reviewModerationCases,
      clientProfile: userProfiles
    })
    .from(reviewModerationCases)
    .innerJoin(reviews, eq(reviews.id, reviewModerationCases.reviewId))
    .innerJoin(reviewableInstances, eq(reviewableInstances.id, reviews.reviewableInstanceId))
    .leftJoin(userProfiles, eq(userProfiles.userId, reviews.clientUserId))
    .where(and(...moderationCaseConditions))
    .orderBy(desc(reviewModerationCases.openedAt), desc(reviewModerationCases.id))
    .limit(query.limit + 1);

  const merged = [
    ...pendingReviewVersions.map((row) =>
      toReviewVersionModerationQueueItem(
        row.review,
        row.reviewableInstance,
        row.version,
        row.clientProfile
      )
    ),
    ...pendingReplyVersions.map((row) =>
      toReplyVersionModerationQueueItem(
        row.review,
        row.reviewableInstance,
        row.replyVersion,
        row.clientProfile
      )
    ),
    ...openModerationCases.map((row) =>
      toModerationCaseQueueItem(
        row.review,
        row.reviewableInstance,
        row.moderationCase,
        row.clientProfile
      )
    )
  ].sort(compareModerationQueueItems);

  const pageItems = merged.slice(0, query.limit);
  const last = pageItems.at(-1) ?? null;
  return reviewModerationQueueResponseSchema.parse({
    items: pageItems,
    nextCursor:
      merged.length > query.limit && last
        ? encodeModerationQueueCursor({
            submittedAt: last.submittedAt,
            queueItemId: last.queueItemId
          })
        : null
  });
}

async function listPublicReviews(
  database: ElevenHouseDatabase,
  input: ReviewPublicListQuery
): Promise<Awaited<ReturnType<ReviewReadStore["listPublicReviews"]>>> {
  const query = reviewPublicListQuerySchema.parse(input);
  const cursor = query.cursor ? parsePublicCursor(query.cursor) : null;
  if (query.cursor && !cursor) return { items: [], nextCursor: null };

  const conditions: SQL[] = [
    eq(reviews.visibilityStatus, "visible"),
    isNotNull(reviews.activePublicVersionId),
    isNotNull(reviews.firstPublishedAt)
  ];
  if (query.astrologerUserId) {
    conditions.push(eq(reviews.astrologerUserId, query.astrologerUserId));
  }
  if (query.productId) {
    conditions.push(eq(reviewableInstances.productId, query.productId));
  }
  if (cursor) {
    const cursorCondition = or(
      lt(reviews.firstPublishedAt, new Date(cursor.publishedAt)),
      and(
        eq(reviews.firstPublishedAt, new Date(cursor.publishedAt)),
        lt(reviews.id, cursor.reviewId)
      )
    );
    if (cursorCondition) conditions.push(cursorCondition);
  }

  const rows = await database
    .select({
      review: reviews,
      reviewableInstance: reviewableInstances,
      activeVersion: reviewVersions,
      activeReplyVersion: reviewReplyVersions,
      clientProfile: userProfiles
    })
    .from(reviews)
    .innerJoin(reviewableInstances, eq(reviewableInstances.id, reviews.reviewableInstanceId))
    .innerJoin(reviewVersions, eq(reviewVersions.id, reviews.activePublicVersionId))
    .leftJoin(reviewReplyVersions, eq(reviewReplyVersions.id, reviews.activePublicReplyVersionId))
    .leftJoin(userProfiles, eq(userProfiles.userId, reviews.clientUserId))
    .where(and(...conditions))
    .orderBy(desc(reviews.firstPublishedAt), desc(reviews.id))
    .limit(query.limit + 1);

  const pageRows = rows.slice(0, query.limit) as readonly PublicReviewRow[];
  const items = pageRows.map(toPublicReviewItem);
  const last = pageRows.at(-1)?.review ?? null;
  return reviewPublicListResponseSchema.parse({
    items,
    nextCursor:
      rows.length > query.limit && last?.firstPublishedAt
        ? encodePublicCursor({
            publishedAt: last.firstPublishedAt.toISOString(),
            reviewId: last.id
          })
        : null
  });
}

async function listClientReviewableInstances(
  database: ElevenHouseDatabase,
  input: ClientReviewableInstanceListQuery
): Promise<Awaited<ReturnType<ReviewReadStore["listClientReviewableInstances"]>>> {
  const query = clientReviewableInstanceListQuerySchema.parse(input);
  const cursor = query.cursor ? parseClientReviewableInstanceCursor(query.cursor) : null;
  if (query.cursor && !cursor) return { items: [], nextCursor: null };

  const conditions: SQL[] = [eq(reviewableInstances.clientUserId, query.clientUserId)];
  if (cursor) {
    const receivedAt = new Date(cursor.receivedAt);
    const cursorCondition = or(
      lt(reviewableInstances.receivedAt, receivedAt),
      and(
        eq(reviewableInstances.receivedAt, receivedAt),
        lt(reviewableInstances.id, cursor.reviewableInstanceId)
      )
    );
    if (cursorCondition) conditions.push(cursorCondition);
  }

  const rows = await database
    .select()
    .from(reviewableInstances)
    .where(and(...conditions))
    .orderBy(desc(reviewableInstances.receivedAt), desc(reviewableInstances.id))
    .limit(query.limit + 1);

  const pageRows = rows.slice(0, query.limit);
  const last = pageRows.at(-1) ?? null;
  return clientReviewableInstanceListResponseSchema.parse({
    items: pageRows.map(toReviewableInstanceSummary),
    nextCursor:
      rows.length > query.limit && last
        ? encodeClientReviewableInstanceCursor({
            receivedAt: last.receivedAt.toISOString(),
            reviewableInstanceId: last.id
          })
        : null
  });
}

async function listAstrologerReviews(
  database: ElevenHouseDatabase,
  input: ReviewAstrologerListQuery
): Promise<Awaited<ReturnType<ReviewReadStore["listAstrologerReviews"]>>> {
  const query = reviewAstrologerListQuerySchema.parse(input);
  const cursor = query.cursor ? parseAstrologerReviewCursor(query.cursor) : null;
  if (query.cursor && !cursor) return { items: [], nextCursor: null };

  const conditions: SQL[] = [
    eq(reviews.astrologerUserId, query.astrologerUserId),
    isNotNull(reviews.activePublicVersionId)
  ];
  if (cursor) {
    const updatedAt = new Date(cursor.updatedAt);
    const cursorCondition = or(
      lt(reviews.updatedAt, updatedAt),
      and(eq(reviews.updatedAt, updatedAt), lt(reviews.id, cursor.reviewId))
    );
    if (cursorCondition) conditions.push(cursorCondition);
  }

  const rows = await database
    .select({
      review: reviews,
      reviewableInstance: reviewableInstances,
      activeVersion: reviewVersions,
      clientProfile: userProfiles
    })
    .from(reviews)
    .innerJoin(reviewableInstances, eq(reviewableInstances.id, reviews.reviewableInstanceId))
    .innerJoin(reviewVersions, eq(reviewVersions.id, reviews.activePublicVersionId))
    .leftJoin(userProfiles, eq(userProfiles.userId, reviews.clientUserId))
    .where(and(...conditions))
    .orderBy(desc(reviews.updatedAt), desc(reviews.id))
    .limit(query.limit + 1);

  const pageRows = rows.slice(0, query.limit);
  const items = await Promise.all(pageRows.map((row) => toAstrologerReviewItem(database, row)));
  const last = pageRows.at(-1)?.review ?? null;
  return reviewAstrologerListResponseSchema.parse({
    items,
    nextCursor:
      rows.length > query.limit && last
        ? encodeAstrologerReviewCursor({
            updatedAt: last.updatedAt.toISOString(),
            reviewId: last.id
          })
        : null
  });
}

async function getClientReviewDetail(
  database: ElevenHouseDatabase,
  input: Parameters<ReviewReadStore["getClientReviewDetail"]>[0]
): Promise<Awaited<ReturnType<ReviewReadStore["getClientReviewDetail"]>>> {
  const [row] = await database
    .select({
      review: reviews,
      reviewableInstance: reviewableInstances
    })
    .from(reviewableInstances)
    .leftJoin(reviews, eq(reviews.reviewableInstanceId, reviewableInstances.id))
    .where(
      and(
        eq(reviewableInstances.id, input.reviewableInstanceId),
        eq(reviewableInstances.clientUserId, input.clientUserId)
      )
    )
    .limit(1);
  if (!row) return null;

  const versions = row.review ? await readReviewVersions(database, row.review.id) : [];
  const activePublicVersion = row.review?.activePublicVersionId
    ? (versions.find((version) => version.id === row.review?.activePublicVersionId) ?? null)
    : null;
  const pendingVersion = row.review?.pendingVersionId
    ? (versions.find((version) => version.id === row.review?.pendingVersionId) ?? null)
    : null;
  const moderationCase = row.review
    ? await readLatestModerationCase(database, row.review.id)
    : null;

  return clientReviewDetailSchema.parse({
    reviewId: row.review?.id ?? null,
    reviewableInstance: toReviewableInstanceSummary(row.reviewableInstance),
    activePublicVersion: activePublicVersion ? toReviewVersion(activePublicVersion) : null,
    pendingVersion: pendingVersion ? toReviewVersion(pendingVersion) : null,
    moderationCase: moderationCase ? toModerationCaseSummary(moderationCase) : null,
    canSubmitNewVersion:
      row.review === null &&
      row.reviewableInstance.status === "reviewable" &&
      Date.now() < row.reviewableInstance.reviewWindowClosesAt.getTime(),
    canEditLatestVersion:
      activePublicVersion !== null &&
      pendingVersion === null &&
      Date.now() < row.reviewableInstance.reviewWindowClosesAt.getTime()
  });
}

async function getAdminReviewDetail(
  database: ElevenHouseDatabase,
  input: Parameters<ReviewReadStore["getAdminReviewDetail"]>[0]
): Promise<Awaited<ReturnType<ReviewReadStore["getAdminReviewDetail"]>>> {
  const [row] = await database
    .select({
      review: reviews,
      reviewableInstance: reviewableInstances,
      clientProfile: userProfiles
    })
    .from(reviews)
    .innerJoin(reviewableInstances, eq(reviewableInstances.id, reviews.reviewableInstanceId))
    .leftJoin(userProfiles, eq(userProfiles.userId, reviews.clientUserId))
    .where(eq(reviews.id, input.reviewId))
    .limit(1);
  if (!row) return null;

  const versions = await readReviewVersions(database, row.review.id);
  const replyVersions = await readReviewReplyVersions(database, row.review.id);
  const moderationCase = await readLatestModerationCase(database, row.review.id);
  const auditTrail = await readReviewAuditTrail(database, row.review.id);

  return reviewAdminDetailSchema.parse({
    reviewId: row.review.id,
    client: toAdminAuthor(row.review.clientUserId, row.clientProfile),
    publicIdentityMode: row.review.publicIdentityMode,
    visibilityStatus: row.review.visibilityStatus,
    disputeStatus: row.review.disputeStatus,
    reviewableInstance: toReviewableInstanceSummary(row.reviewableInstance),
    versions: versions.map(toReviewVersion),
    replyVersions: replyVersions.map(toReviewReplyVersion),
    moderationCase: moderationCase ? toModerationCaseSummary(moderationCase) : null,
    auditTrail: auditTrail.map(toReviewAdminAuditEntry),
    auditCursor: null
  });
}

async function getModerationCaseDetail(
  database: ElevenHouseDatabase,
  input: Parameters<ReviewReadStore["getModerationCaseDetail"]>[0]
): Promise<Awaited<ReturnType<ReviewReadStore["getModerationCaseDetail"]>>> {
  const [row] = await database
    .select({
      moderationCase: reviewModerationCases,
      review: reviews,
      reviewableInstance: reviewableInstances
    })
    .from(reviewModerationCases)
    .innerJoin(reviews, eq(reviews.id, reviewModerationCases.reviewId))
    .innerJoin(reviewableInstances, eq(reviewableInstances.id, reviews.reviewableInstanceId))
    .where(eq(reviewModerationCases.id, input.caseId))
    .limit(1);
  if (!row || !canActorReadCase(input, row.review)) return null;

  const visibility = visibilityConditionForActorRole(input.actorRole);
  const conditions: SQL[] = [
    eq(reviewModerationCaseMessages.caseId, input.caseId),
    validCaseMessageVisibilityCondition()
  ];
  if (visibility) conditions.push(visibility);

  const messages = await database
    .select()
    .from(reviewModerationCaseMessages)
    .where(and(...conditions))
    .orderBy(asc(reviewModerationCaseMessages.createdAt), asc(reviewModerationCaseMessages.id));

  return reviewModerationCaseDetailSchema.parse({
    caseId: row.moderationCase.id,
    reviewId: row.review.id,
    status: row.moderationCase.status,
    openedAt: row.moderationCase.openedAt.toISOString(),
    closedAt: row.moderationCase.closedAt?.toISOString() ?? null,
    serviceContext: {
      title: row.reviewableInstance.titleSnapshot,
      contextLabel: row.reviewableInstance.contextLabelSnapshot
    },
    messages: messages.map(toModerationCaseMessage)
  });
}

async function readReviewVersions(
  database: ElevenHouseDatabase,
  reviewId: string
): Promise<readonly ReviewVersionRow[]> {
  return database
    .select()
    .from(reviewVersions)
    .where(eq(reviewVersions.reviewId, reviewId))
    .orderBy(reviewVersions.versionNumber);
}

async function readReviewReplyVersions(
  database: ElevenHouseDatabase,
  reviewId: string
): Promise<readonly ReviewReplyVersionRow[]> {
  return database
    .select()
    .from(reviewReplyVersions)
    .where(eq(reviewReplyVersions.reviewId, reviewId))
    .orderBy(reviewReplyVersions.versionNumber);
}

async function readLatestModerationCase(
  database: ElevenHouseDatabase,
  reviewId: string
): Promise<ReviewModerationCaseRow | null> {
  const [row] = await database
    .select()
    .from(reviewModerationCases)
    .where(eq(reviewModerationCases.reviewId, reviewId))
    .orderBy(desc(reviewModerationCases.openedAt), desc(reviewModerationCases.id))
    .limit(1);
  return row ?? null;
}

async function readReviewAuditTrail(
  database: ElevenHouseDatabase,
  reviewId: string
): Promise<readonly AuditLogEntryRow[]> {
  return database
    .select()
    .from(auditLogEntries)
    .where(and(eq(auditLogEntries.targetType, "review"), eq(auditLogEntries.targetId, reviewId)))
    .orderBy(desc(auditLogEntries.occurredAt), desc(auditLogEntries.id))
    .limit(100);
}

function toReviewAdminAuditEntry(row: AuditLogEntryRow): ReviewAdminAuditEntry {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    action: row.action,
    occurredAt: row.occurredAt.toISOString(),
    metadata: row.metadata as Record<string, unknown>
  };
}

function toPublicReviewItem(row: PublicReviewRow): ReviewPublicItem {
  const identity = splitDisplayName(row.clientProfile?.displayName ?? null);
  return {
    reviewId: row.review.id,
    reviewableInstanceId: row.review.reviewableInstanceId,
    astrologerUserId: row.review.astrologerUserId,
    productId: row.reviewableInstance.productId,
    title: row.reviewableInstance.titleSnapshot,
    contextLabel: row.reviewableInstance.contextLabelSnapshot,
    rating: row.activeVersion.rating,
    text: row.activeVersion.text,
    author: buildReviewPublicAuthor({
      publicIdentityMode: row.activeVersion.publicIdentityMode as ReviewPublicIdentityMode,
      firstName: identity.firstName,
      lastName: identity.lastName,
      avatarUrl: null
    }),
    publishedAt: requiredIsoDate(
      row.activeVersion.decidedAt ?? row.review.firstPublishedAt,
      "Visible review requires a publication timestamp"
    ),
    astrologerReply: row.activeReplyVersion
      ? {
          replyId: row.activeReplyVersion.id,
          text: row.activeReplyVersion.text,
          publishedAt:
            row.activeReplyVersion.decidedAt?.toISOString() ??
            row.activeReplyVersion.submittedAt.toISOString()
        }
      : null
  };
}

async function toAstrologerReviewItem(
  database: ElevenHouseDatabase,
  row: {
    readonly review: ReviewRow;
    readonly reviewableInstance: ReviewableInstanceRow;
    readonly activeVersion: ReviewVersionRow;
    readonly clientProfile: UserProfileRow | null;
  }
): Promise<ReviewAstrologerItem> {
  const identity = splitDisplayName(row.clientProfile?.displayName ?? null);
  const reviewVersions = await readReviewVersions(database, row.review.id);
  const pendingVersion = row.review.pendingVersionId
    ? (reviewVersions.find((version) => version.id === row.review.pendingVersionId) ?? null)
    : null;
  const replyVersions = await readReviewReplyVersions(database, row.review.id);
  const activePublicReplyVersion = row.review.activePublicReplyVersionId
    ? (replyVersions.find((version) => version.id === row.review.activePublicReplyVersionId) ??
      null)
    : null;
  const pendingReplyVersion = row.review.pendingReplyVersionId
    ? (replyVersions.find((version) => version.id === row.review.pendingReplyVersionId) ?? null)
    : null;
  const moderationCase = await readLatestModerationCase(database, row.review.id);

  return {
    reviewId: row.review.id,
    visibilityStatus: row.review.visibilityStatus as ReviewAstrologerItem["visibilityStatus"],
    disputeStatus: row.review.disputeStatus as ReviewAstrologerItem["disputeStatus"],
    reviewableInstance: toReviewableInstanceSummary(row.reviewableInstance),
    author: buildReviewPublicAuthor({
      publicIdentityMode: row.activeVersion.publicIdentityMode as ReviewPublicIdentityMode,
      firstName: identity.firstName,
      lastName: identity.lastName,
      avatarUrl: null
    }),
    activePublicVersion: toReviewVersion(row.activeVersion),
    pendingVersion: pendingVersion ? toReviewVersion(pendingVersion) : null,
    activePublicReplyVersion: activePublicReplyVersion
      ? toReviewReplyVersion(activePublicReplyVersion)
      : null,
    pendingReplyVersion: pendingReplyVersion ? toReviewReplyVersion(pendingReplyVersion) : null,
    moderationCase: moderationCase ? toModerationCaseSummary(moderationCase) : null
  };
}

function requiredIsoDate(value: Date | null, message: string): string {
  if (!value) throw new Error(message);
  return value.toISOString();
}

function toReviewableInstanceSummary(row: ReviewableInstanceRow): ReviewableInstanceSummary {
  return {
    id: row.id,
    kind: row.kind as ReviewableInstanceSummary["kind"],
    status: resolveReviewableInstanceSummaryStatus(row),
    title: row.titleSnapshot,
    contextLabel: row.contextLabelSnapshot,
    receivedAt: row.receivedAt.toISOString(),
    reviewWindowClosesAt: row.reviewWindowClosesAt.toISOString(),
    windowPolicy: row.windowPolicy as ReviewableInstanceSummary["windowPolicy"]
  };
}

function resolveReviewableInstanceSummaryStatus(
  row: ReviewableInstanceRow
): ReviewableInstanceSummary["status"] {
  if (row.status === "reviewable" && Date.now() >= row.reviewWindowClosesAt.getTime()) {
    return "window_closed";
  }
  return row.status as ReviewableInstanceSummary["status"];
}

function toReviewVersion(row: ReviewVersionRow): ReviewVersion {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    rating: row.rating,
    text: row.text,
    publicIdentityMode: row.publicIdentityMode as ReviewVersion["publicIdentityMode"],
    moderationStatus: row.moderationStatus as ReviewVersion["moderationStatus"],
    moderationReasonCode: row.moderationReasonCode as ReviewVersion["moderationReasonCode"],
    submittedAt: row.submittedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null
  };
}

function toReviewReplyVersion(row: ReviewReplyVersionRow): ReviewReplyVersion {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    text: row.text,
    moderationStatus: row.moderationStatus as ReviewReplyVersion["moderationStatus"],
    moderationReasonCode: row.moderationReasonCode as ReviewReplyVersion["moderationReasonCode"],
    submittedAt: row.submittedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null
  };
}

function toAdminAuthor(clientUserId: string, profile: UserProfileRow | null): ReviewAdminAuthor {
  const identity = splitDisplayName(profile?.displayName ?? null);
  return {
    clientUserId,
    displayName: [identity.firstName, identity.lastName].filter(Boolean).join(" "),
    initials: buildInitials(identity.firstName, identity.lastName),
    avatarUrl: null
  };
}

function toReviewVersionModerationQueueItem(
  review: ReviewRow,
  reviewableInstance: ReviewableInstanceRow,
  version: ReviewVersionRow,
  clientProfile: UserProfileRow | null
): ReviewModerationQueueItem {
  return {
    queueItemId: `review_version:${version.id}`,
    kind: "review_version",
    reviewId: review.id,
    reviewVersionId: version.id,
    replyVersionId: null,
    caseId: null,
    caseStatus: null,
    submittedAt: version.submittedAt.toISOString(),
    client: toAdminAuthor(review.clientUserId, clientProfile),
    publicIdentityMode:
      version.publicIdentityMode as ReviewModerationQueueItem["publicIdentityMode"],
    visibilityStatus: review.visibilityStatus as ReviewModerationQueueItem["visibilityStatus"],
    disputeStatus: review.disputeStatus as ReviewModerationQueueItem["disputeStatus"],
    reviewableInstance: toReviewableInstanceSummary(reviewableInstance),
    rating: version.rating,
    text: version.text
  };
}

function toReplyVersionModerationQueueItem(
  review: ReviewRow,
  reviewableInstance: ReviewableInstanceRow,
  replyVersion: ReviewReplyVersionRow,
  clientProfile: UserProfileRow | null
): ReviewModerationQueueItem {
  return {
    queueItemId: `reply_version:${replyVersion.id}`,
    kind: "reply_version",
    reviewId: review.id,
    reviewVersionId: null,
    replyVersionId: replyVersion.id,
    caseId: null,
    caseStatus: null,
    submittedAt: replyVersion.submittedAt.toISOString(),
    client: toAdminAuthor(review.clientUserId, clientProfile),
    publicIdentityMode:
      review.publicIdentityMode as ReviewModerationQueueItem["publicIdentityMode"],
    visibilityStatus: review.visibilityStatus as ReviewModerationQueueItem["visibilityStatus"],
    disputeStatus: review.disputeStatus as ReviewModerationQueueItem["disputeStatus"],
    reviewableInstance: toReviewableInstanceSummary(reviewableInstance),
    rating: null,
    text: replyVersion.text
  };
}

function toModerationCaseQueueItem(
  review: ReviewRow,
  reviewableInstance: ReviewableInstanceRow,
  moderationCase: ReviewModerationCaseRow,
  clientProfile: UserProfileRow | null
): ReviewModerationQueueItem {
  return {
    queueItemId: `moderation_case:${moderationCase.id}`,
    kind: "moderation_case",
    reviewId: review.id,
    reviewVersionId: null,
    replyVersionId: null,
    caseId: moderationCase.id,
    caseStatus: moderationCase.status as ReviewModerationQueueItem["caseStatus"],
    submittedAt: moderationCase.openedAt.toISOString(),
    client: toAdminAuthor(review.clientUserId, clientProfile),
    publicIdentityMode:
      review.publicIdentityMode as ReviewModerationQueueItem["publicIdentityMode"],
    visibilityStatus: review.visibilityStatus as ReviewModerationQueueItem["visibilityStatus"],
    disputeStatus: review.disputeStatus as ReviewModerationQueueItem["disputeStatus"],
    reviewableInstance: toReviewableInstanceSummary(reviewableInstance),
    rating: null,
    text: `Спор открыт: ${moderationReasonLabel(moderationCase.reasonCode)}`
  };
}

function toModerationCaseSummary(row: ReviewModerationCaseRow): ReviewModerationCaseSummary {
  return {
    caseId: row.id,
    status: row.status as ReviewModerationCaseSummary["status"],
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    reasonCode: row.reasonCode as ReviewModerationCaseSummary["reasonCode"]
  };
}

function toModerationCaseMessage(row: ReviewModerationCaseMessageRow): ReviewModerationCaseMessage {
  return {
    messageId: row.id,
    authorRole: row.authorRole as ReviewModerationCaseMessage["authorRole"],
    visibility: row.visibility as ReviewModerationCaseMessage["visibility"],
    body: row.body,
    createdAt: row.createdAt.toISOString()
  };
}

function canActorReadCase(
  input: Parameters<ReviewReadStore["getModerationCaseDetail"]>[0],
  review: ReviewRow
): boolean {
  if (input.actorRole === "moderator") return true;
  if (input.actorRole === "client") return review.clientUserId === input.actorUserId;
  return review.astrologerUserId === input.actorUserId;
}

function visibilityConditionForActorRole(
  actorRole: Parameters<ReviewReadStore["getModerationCaseDetail"]>[0]["actorRole"]
): SQL | null {
  if (actorRole === "moderator") return null;
  const ownThreadVisibility =
    actorRole === "client" ? "client_and_moderators" : "astrologer_and_moderators";
  return (
    or(
      eq(reviewModerationCaseMessages.visibility, ownThreadVisibility),
      and(
        eq(reviewModerationCaseMessages.visibility, "all_case_participants"),
        inArray(reviewModerationCaseMessages.authorRole, ["moderator", "system"])
      )
    ) ?? null
  );
}

function validCaseMessageVisibilityCondition(): SQL {
  return (
    or(
      inArray(reviewModerationCaseMessages.visibility, [
        "client_and_moderators",
        "astrologer_and_moderators",
        "moderators_only"
      ]),
      and(
        eq(reviewModerationCaseMessages.visibility, "all_case_participants"),
        inArray(reviewModerationCaseMessages.authorRole, ["moderator", "system"])
      )
    ) ?? sql`false`
  );
}

function splitDisplayName(value: string | null): { firstName: string; lastName: string | null } {
  const normalized = (value?.trim().replace(/\s+/g, " ") || "Клиент").slice(0, 120);
  const [firstName = "Клиент", ...rest] = normalized.split(" ");
  return {
    firstName,
    lastName: rest.length > 0 ? rest.join(" ") : null
  };
}

function buildInitials(firstName: string, lastName: string | null): string {
  if (lastName) return `${firstName.slice(0, 1)}${lastName.slice(0, 1)}`.toUpperCase();
  return firstName.slice(0, 2).toUpperCase();
}

function encodePublicCursor(cursor: PublicReviewCursor): string {
  return `${publicCursorVersion}.${Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")}`;
}

function parsePublicCursor(value: string): PublicReviewCursor | null {
  const [version, payload] = value.split(".");
  if (version !== publicCursorVersion || !payload) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<PublicReviewCursor>;
    if (typeof parsed.publishedAt !== "string" || typeof parsed.reviewId !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.publishedAt))) return null;
    return { publishedAt: parsed.publishedAt, reviewId: parsed.reviewId };
  } catch {
    return null;
  }
}

function encodeClientReviewableInstanceCursor(cursor: ClientReviewableInstanceCursor): string {
  return `${clientReviewableInstanceCursorVersion}.${Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")}`;
}

function parseClientReviewableInstanceCursor(value: string): ClientReviewableInstanceCursor | null {
  const [version, payload] = value.split(".");
  if (version !== clientReviewableInstanceCursorVersion || !payload) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<ClientReviewableInstanceCursor>;
    if (typeof parsed.receivedAt !== "string" || typeof parsed.reviewableInstanceId !== "string") {
      return null;
    }
    if (Number.isNaN(Date.parse(parsed.receivedAt))) return null;
    return {
      receivedAt: parsed.receivedAt,
      reviewableInstanceId: parsed.reviewableInstanceId
    };
  } catch {
    return null;
  }
}

function encodeAstrologerReviewCursor(cursor: AstrologerReviewCursor): string {
  return `${astrologerReviewCursorVersion}.${Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")}`;
}

function parseAstrologerReviewCursor(value: string): AstrologerReviewCursor | null {
  const [version, payload] = value.split(".");
  if (version !== astrologerReviewCursorVersion || !payload) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<AstrologerReviewCursor>;
    if (typeof parsed.updatedAt !== "string" || typeof parsed.reviewId !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.updatedAt))) return null;
    return { updatedAt: parsed.updatedAt, reviewId: parsed.reviewId };
  } catch {
    return null;
  }
}

function compareModerationQueueItems(
  left: ReviewModerationQueueItem,
  right: ReviewModerationQueueItem
): number {
  const timeDiff = Date.parse(right.submittedAt) - Date.parse(left.submittedAt);
  if (timeDiff !== 0) return timeDiff;
  return right.queueItemId.localeCompare(left.queueItemId);
}

function moderationQueueCursorCondition(
  submittedAtColumn:
    | typeof reviewVersions.submittedAt
    | typeof reviewReplyVersions.submittedAt
    | typeof reviewModerationCases.openedAt,
  queueItemIdExpression: SQL<string>,
  cursor: ModerationQueueCursor
): SQL {
  const submittedAt = new Date(cursor.submittedAt);
  return sql`(${submittedAtColumn} < ${submittedAt} or (${submittedAtColumn} = ${submittedAt} and ${queueItemIdExpression} < ${cursor.queueItemId}))`;
}

function moderationReasonLabel(reasonCode: string): string {
  switch (reasonCode) {
    case "spam":
      return "Спам";
    case "abuse_or_hate":
      return "Оскорбления или hate";
    case "personal_data_exposure":
      return "Персональные данные";
    case "off_topic":
      return "Не относится к услуге";
    case "not_service_related":
      return "Нет связи с оказанной услугой";
    case "fraud_or_conflict":
      return "Подозрение на конфликт/фрод";
    case "duplicate":
      return "Дубликат";
    case "legal_risk":
      return "Юридический риск";
    case "other":
      return "Другое";
    default:
      return "Другое";
  }
}

function encodeModerationQueueCursor(cursor: ModerationQueueCursor): string {
  return `${moderationQueueCursorVersion}.${Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")}`;
}

function parseModerationQueueCursor(value: string): ModerationQueueCursor | null {
  const [version, payload] = value.split(".");
  if (version !== moderationQueueCursorVersion || !payload) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<ModerationQueueCursor>;
    if (typeof parsed.submittedAt !== "string" || typeof parsed.queueItemId !== "string") {
      return null;
    }
    if (Number.isNaN(Date.parse(parsed.submittedAt))) return null;
    return { submittedAt: parsed.submittedAt, queueItemId: parsed.queueItemId };
  } catch {
    return null;
  }
}
