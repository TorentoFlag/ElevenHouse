import {
  clientReviewDetailSchema,
  reviewAdminDetailSchema,
  reviewModerationCaseDetailSchema,
  reviewPublicListQuerySchema,
  reviewPublicListResponseSchema,
  type ReviewAdminAuthor,
  type ReviewModerationCaseMessage,
  type ReviewModerationCaseSummary,
  type ReviewPublicItem,
  type ReviewPublicIdentityMode,
  type ReviewPublicListQuery,
  type ReviewVersion,
  type ReviewableInstanceSummary
} from "@elevenhouse/contracts";
import { buildReviewPublicAuthor, type ReviewReadStore } from "@elevenhouse/domain";
import { and, asc, desc, eq, inArray, isNotNull, lt, or, type SQL } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
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

const publicCursorVersion = "reviews_public_v1";

export function createDrizzleReviewReadStore(database: ElevenHouseDatabase): ReviewReadStore {
  return {
    listPublicReviews: (query) => listPublicReviews(database, query),
    getClientReviewDetail: (input) => getClientReviewDetail(database, input),
    getAdminReviewDetail: (input) => getAdminReviewDetail(database, input),
    getModerationCaseDetail: (input) => getModerationCaseDetail(database, input)
  };
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
      and(eq(reviews.firstPublishedAt, new Date(cursor.publishedAt)), lt(reviews.id, cursor.reviewId))
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
    nextCursor: rows.length > query.limit && last?.firstPublishedAt
      ? encodePublicCursor({ publishedAt: last.firstPublishedAt.toISOString(), reviewId: last.id })
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
    .innerJoin(reviews, eq(reviews.reviewableInstanceId, reviewableInstances.id))
    .where(
      and(
        eq(reviewableInstances.id, input.reviewableInstanceId),
        eq(reviewableInstances.clientUserId, input.clientUserId)
      )
    )
    .limit(1);
  if (!row) return null;

  const versions = await readReviewVersions(database, row.review.id);
  const activePublicVersion = row.review.activePublicVersionId
    ? versions.find((version) => version.id === row.review.activePublicVersionId) ?? null
    : null;
  const pendingVersion = row.review.pendingVersionId
    ? versions.find((version) => version.id === row.review.pendingVersionId) ?? null
    : null;

  return clientReviewDetailSchema.parse({
    reviewId: row.review.id,
    reviewableInstance: toReviewableInstanceSummary(row.reviewableInstance),
    activePublicVersion: activePublicVersion ? toReviewVersion(activePublicVersion) : null,
    pendingVersion: pendingVersion ? toReviewVersion(pendingVersion) : null,
    canSubmitNewVersion: false,
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
  const moderationCase = await readLatestModerationCase(database, row.review.id);

  return reviewAdminDetailSchema.parse({
    reviewId: row.review.id,
    client: toAdminAuthor(row.review.clientUserId, row.clientProfile),
    publicIdentityMode: row.review.publicIdentityMode,
    visibilityStatus: row.review.visibilityStatus,
    disputeStatus: row.review.disputeStatus,
    reviewableInstance: toReviewableInstanceSummary(row.reviewableInstance),
    versions: versions.map(toReviewVersion),
    moderationCase: moderationCase ? toModerationCaseSummary(moderationCase) : null,
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

  const visibility = visibilityForActorRole(input.actorRole);
  const conditions: SQL[] = [eq(reviewModerationCaseMessages.caseId, input.caseId)];
  if (visibility !== "all") {
    conditions.push(inArray(reviewModerationCaseMessages.visibility, visibility));
  }

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
          publishedAt: row.activeReplyVersion.decidedAt?.toISOString() ?? row.activeReplyVersion.submittedAt.toISOString()
        }
      : null
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
    status: row.status as ReviewableInstanceSummary["status"],
    title: row.titleSnapshot,
    contextLabel: row.contextLabelSnapshot,
    receivedAt: row.receivedAt.toISOString(),
    reviewWindowClosesAt: row.reviewWindowClosesAt.toISOString(),
    windowPolicy: row.windowPolicy as ReviewableInstanceSummary["windowPolicy"]
  };
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

function toAdminAuthor(clientUserId: string, profile: UserProfileRow | null): ReviewAdminAuthor {
  const identity = splitDisplayName(profile?.displayName ?? null);
  return {
    clientUserId,
    displayName: [identity.firstName, identity.lastName].filter(Boolean).join(" "),
    initials: buildInitials(identity.firstName, identity.lastName),
    avatarUrl: null
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

function visibilityForActorRole(
  actorRole: Parameters<ReviewReadStore["getModerationCaseDetail"]>[0]["actorRole"]
): "all" | readonly string[] {
  if (actorRole === "moderator") return "all";
  if (actorRole === "client") return ["all_case_participants", "client_and_moderators"];
  return ["all_case_participants", "astrologer_and_moderators"];
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
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<PublicReviewCursor>;
    if (typeof parsed.publishedAt !== "string" || typeof parsed.reviewId !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.publishedAt))) return null;
    return { publishedAt: parsed.publishedAt, reviewId: parsed.reviewId };
  } catch {
    return null;
  }
}
