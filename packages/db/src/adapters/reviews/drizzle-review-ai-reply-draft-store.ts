import {
  reviewDisputeStatusSchema,
  reviewModerationStatusSchema,
  reviewPublicIdentityModeSchema,
  reviewVisibilityStatusSchema,
  type ReviewDisputeStatus,
  type ReviewModerationStatus,
  type ReviewPublicIdentityMode,
  type ReviewVisibilityStatus
} from "@elevenhouse/contracts";
import {
  createReviewReplyDraftCommand,
  type CreateReviewReplyDraftCommandResult,
  type ReviewLifecycleState,
  type ReviewVersionLifecycleState
} from "@elevenhouse/domain";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { reviewAiReplyDrafts, reviewVersions, reviewableInstances, reviews } from "../../schema";

type ReviewAiReplyDraftTransaction = Parameters<
  Parameters<ElevenHouseDatabase["transaction"]>[0]
>[0];
type ReviewRow = typeof reviews.$inferSelect;
type ReviewVersionRow = typeof reviewVersions.$inferSelect;
type ReviewableInstanceRow = typeof reviewableInstances.$inferSelect;

export type ReviewAiReplyDraftCompletionResult =
  | { readonly kind: "updated" }
  | { readonly kind: "not_updated"; readonly reason: "draft_not_pending" };

export type DrizzleReviewAiReplyDraftStore = {
  readonly createReplyDraftCommand: (input: {
    readonly actorUserId: string;
    readonly now: string;
    readonly reviewId: string;
    readonly nextDraftId: string;
    readonly attemptId: string;
  }) => Promise<CreateReviewReplyDraftCommandResult>;
  readonly markReplyDraftSucceeded: (input: {
    readonly attemptId: string;
    readonly now: string;
    readonly draftText: string;
  }) => Promise<ReviewAiReplyDraftCompletionResult>;
  readonly markReplyDraftFailed: (input: {
    readonly attemptId: string;
    readonly now: string;
    readonly safeErrorCode: string;
  }) => Promise<ReviewAiReplyDraftCompletionResult>;
};

export function createDrizzleReviewAiReplyDraftStore(
  database: ElevenHouseDatabase
): DrizzleReviewAiReplyDraftStore {
  return {
    createReplyDraftCommand: (input) =>
      database.transaction(async (transaction) => {
        const reviewRow = await readReview(transaction, input.reviewId);
        if (!reviewRow) return { kind: "rejected", reason: "review_not_public" };

        const review = await hydrateReviewForAiDraft(transaction, reviewRow);
        const reviewableInstance = await readReviewableInstance(
          transaction,
          review.reviewableInstanceId
        );
        if (!reviewableInstance) return { kind: "rejected", reason: "review_not_public" };

        const draftAlreadyPending = await hasPendingDraft(transaction, review.id);
        const result = createReviewReplyDraftCommand({
          actorUserId: input.actorUserId,
          attemptId: input.attemptId,
          now: input.now,
          review,
          serviceContext: {
            title: reviewableInstance.titleSnapshot,
            contextLabel: reviewableInstance.contextLabelSnapshot
          },
          draftAlreadyPending
        });
        if (result.kind === "rejected") return result;

        await transaction.insert(reviewAiReplyDrafts).values({
          id: input.nextDraftId,
          reviewId: review.id,
          astrologerUserId: review.astrologerUserId,
          aiUsageAttemptId: result.command.attemptId,
          status: "pending",
          promptId: result.command.promptId,
          promptVersion: result.command.promptVersion,
          promptInputDigest: result.command.resourceEvidence.sourceChecksum,
          draftText: null,
          safeErrorCode: null,
          requestedAt: new Date(result.command.requestedAt),
          completedAt: null,
          createdAt: new Date(result.command.requestedAt)
        });

        return result;
      }),
    markReplyDraftSucceeded: async (input) => {
      const updated = await database
        .update(reviewAiReplyDrafts)
        .set({
          status: "succeeded",
          draftText: input.draftText,
          safeErrorCode: null,
          completedAt: new Date(input.now)
        })
        .where(
          and(
            eq(reviewAiReplyDrafts.aiUsageAttemptId, input.attemptId),
            eq(reviewAiReplyDrafts.status, "pending")
          )
        )
        .returning({ id: reviewAiReplyDrafts.id });
      return updated.length === 1
        ? { kind: "updated" }
        : { kind: "not_updated", reason: "draft_not_pending" };
    },
    markReplyDraftFailed: async (input) => {
      const updated = await database
        .update(reviewAiReplyDrafts)
        .set({
          status: "failed",
          draftText: null,
          safeErrorCode: input.safeErrorCode,
          completedAt: new Date(input.now)
        })
        .where(
          and(
            eq(reviewAiReplyDrafts.aiUsageAttemptId, input.attemptId),
            eq(reviewAiReplyDrafts.status, "pending")
          )
        )
        .returning({ id: reviewAiReplyDrafts.id });
      return updated.length === 1
        ? { kind: "updated" }
        : { kind: "not_updated", reason: "draft_not_pending" };
    }
  };
}

async function readReview(
  transaction: ReviewAiReplyDraftTransaction,
  reviewId: string
): Promise<ReviewRow | null> {
  const [row] = await transaction.select().from(reviews).where(eq(reviews.id, reviewId));
  return row ?? null;
}

async function readReviewVersion(
  transaction: ReviewAiReplyDraftTransaction,
  reviewId: string,
  versionId: string
): Promise<ReviewVersionRow | null> {
  const [row] = await transaction
    .select()
    .from(reviewVersions)
    .where(and(eq(reviewVersions.reviewId, reviewId), eq(reviewVersions.id, versionId)));
  return row ?? null;
}

async function readReviewableInstance(
  transaction: ReviewAiReplyDraftTransaction,
  reviewableInstanceId: string
): Promise<ReviewableInstanceRow | null> {
  const [row] = await transaction
    .select()
    .from(reviewableInstances)
    .where(eq(reviewableInstances.id, reviewableInstanceId));
  return row ?? null;
}

async function hasPendingDraft(
  transaction: ReviewAiReplyDraftTransaction,
  reviewId: string
): Promise<boolean> {
  const [row] = await transaction
    .select({ id: reviewAiReplyDrafts.id })
    .from(reviewAiReplyDrafts)
    .where(and(eq(reviewAiReplyDrafts.reviewId, reviewId), eq(reviewAiReplyDrafts.status, "pending")))
    .limit(1);
  return row !== undefined;
}

async function hydrateReviewForAiDraft(
  transaction: ReviewAiReplyDraftTransaction,
  review: ReviewRow
): Promise<ReviewLifecycleState> {
  const activePublicVersion = review.activePublicVersionId
    ? await readReviewVersion(transaction, review.id, review.activePublicVersionId)
    : null;
  return {
    id: review.id,
    reviewableInstanceId: review.reviewableInstanceId,
    clientUserId: review.clientUserId,
    astrologerUserId: review.astrologerUserId,
    revision: review.revision,
    publicIdentityMode: parseReviewPublicIdentityMode(review.publicIdentityMode),
    visibilityStatus: parseReviewVisibilityStatus(review.visibilityStatus),
    disputeStatus: parseReviewDisputeStatus(review.disputeStatus),
    firstPublishedAt: review.firstPublishedAt ? review.firstPublishedAt.toISOString() : null,
    activePublicVersion: activePublicVersion ? mapVersion(activePublicVersion) : null,
    pendingVersion: null,
    activePublicReplyVersion: null,
    pendingReplyVersion: null
  };
}

function mapVersion(row: ReviewVersionRow): ReviewVersionLifecycleState {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    rating: row.rating,
    text: row.text,
    publicIdentityMode: parseReviewPublicIdentityMode(row.publicIdentityMode),
    moderationStatus: parseReviewModerationStatus(row.moderationStatus),
    submittedAt: row.submittedAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null
  };
}

function parseReviewPublicIdentityMode(value: string): ReviewPublicIdentityMode {
  return reviewPublicIdentityModeSchema.parse(value);
}

function parseReviewVisibilityStatus(value: string): ReviewVisibilityStatus {
  return reviewVisibilityStatusSchema.parse(value);
}

function parseReviewDisputeStatus(value: string): ReviewDisputeStatus {
  return reviewDisputeStatusSchema.parse(value);
}

function parseReviewModerationStatus(value: string): ReviewModerationStatus {
  return reviewModerationStatusSchema.parse(value);
}
