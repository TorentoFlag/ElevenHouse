import {
  reviewDisputeStatusSchema,
  reviewModerationCaseMessageAuthorRoleSchema,
  reviewModerationCaseMessageVisibilitySchema,
  reviewModerationStatusSchema,
  reviewPublicIdentityModeSchema,
  reviewableInstanceStatusSchema,
  reviewVisibilityStatusSchema,
  type ReviewDisputeStatus,
  type ReviewModerationCaseMessageAuthorRole,
  type ReviewModerationCaseMessageVisibility,
  type ReviewModerationReasonCode,
  type ReviewModerationStatus,
  type ReviewPublicIdentityMode,
  type ReviewableInstanceStatus,
  type ReviewVisibilityStatus
} from "@elevenhouse/contracts";
import {
  approveReviewReplyVersion,
  approveReviewVersion,
  createReviewCaseMessage,
  hideReviewByModeration,
  openReviewDispute,
  planSubmitReviewVersion,
  planSubmitReviewReplyVersion,
  rejectReviewReplyVersion,
  rejectReviewVersion,
  restoreReviewAfterDispute,
  updateReviewModerationCaseStatus,
  type ApproveReviewReplyVersionResult,
  type ApproveReviewVersionResult,
  type CreateReviewCaseMessageResult,
  type HideReviewByModerationResult,
  type OpenReviewDisputeResult,
  type ReviewCaseMessageLifecycleState,
  type ReviewLifecycleState,
  type ReviewModerationCaseLifecycleState,
  type ReviewReplyVersionLifecycleState,
  type ReviewSubmissionLifecycleInput,
  type ReviewVersionLifecycleState,
  type RejectReviewReplyVersionResult,
  type RejectReviewVersionResult,
  type RestoreReviewAfterDisputeResult,
  type SubmitReviewReplyVersionResult,
  type SubmitReviewVersionResult,
  type UpdateReviewModerationCaseStatusResult
} from "@elevenhouse/domain";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  auditLogEntries,
  reviewModerationCases,
  reviewModerationCaseMessages,
  reviewPublicationEvents,
  reviewRatingAggregates,
  reviewReplyVersions,
  reviewVersions,
  reviewableInstances,
  reviews
} from "../../schema";

type ReviewCommandTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type ReviewRow = typeof reviews.$inferSelect;
type ReviewVersionRow = typeof reviewVersions.$inferSelect;
type ReviewReplyVersionRow = typeof reviewReplyVersions.$inferSelect;
type ReviewableInstanceRow = typeof reviewableInstances.$inferSelect;
type ReviewModerationCaseRow = typeof reviewModerationCases.$inferSelect;
type ReviewModerationCaseMessageRow = typeof reviewModerationCaseMessages.$inferSelect;

export type DrizzleReviewCommandStore = {
  readonly submitReviewVersion: (input: {
    readonly actorUserId: string;
    readonly now: string;
    readonly reviewableInstanceId: string;
    readonly nextReviewId: string;
    readonly nextVersionId: string;
    readonly submission: ReviewSubmissionLifecycleInput;
  }) => Promise<SubmitReviewVersionResult>;
  readonly approveReviewVersion: (input: {
    readonly moderatorUserId: string;
    readonly now: string;
    readonly reviewId: string;
    readonly versionId: string;
    readonly nextPublicationEventId: string;
  }) => Promise<ApproveReviewVersionResult>;
  readonly rejectReviewVersion: (input: {
    readonly moderatorUserId: string;
    readonly now: string;
    readonly reviewId: string;
    readonly versionId: string;
    readonly reasonCode: ReviewModerationReasonCode;
    readonly note: string | null;
  }) => Promise<RejectReviewVersionResult>;
  readonly submitReviewReplyVersion: (input: {
    readonly actorUserId: string;
    readonly now: string;
    readonly reviewId: string;
    readonly nextReplyVersionId: string;
    readonly text: string;
  }) => Promise<SubmitReviewReplyVersionResult>;
  readonly approveReviewReplyVersion: (input: {
    readonly moderatorUserId: string;
    readonly now: string;
    readonly reviewId: string;
    readonly replyVersionId: string;
  }) => Promise<ApproveReviewReplyVersionResult>;
  readonly rejectReviewReplyVersion: (input: {
    readonly moderatorUserId: string;
    readonly now: string;
    readonly reviewId: string;
    readonly replyVersionId: string;
    readonly reasonCode: ReviewModerationReasonCode;
    readonly note: string | null;
  }) => Promise<RejectReviewReplyVersionResult>;
  readonly openReviewDispute: (input: {
    readonly actorUserId: string;
    readonly now: string;
    readonly reviewId: string;
    readonly nextCaseId: string;
    readonly nextMessageId?: string | null;
    readonly reasonCode: ReviewModerationReasonCode;
    readonly note?: string | null;
  }) => Promise<OpenReviewDisputeResult>;
  readonly restoreReviewAfterDispute: (input: {
    readonly moderatorUserId: string;
    readonly now: string;
    readonly reviewId: string;
    readonly caseId: string;
  }) => Promise<RestoreReviewAfterDisputeResult>;
  readonly hideReviewByModeration: (input: {
    readonly moderatorUserId: string;
    readonly now: string;
    readonly reviewId: string;
    readonly caseId: string | null;
    readonly nextCaseId: string;
    readonly nextCaseMessageId: string | null;
    readonly reasonCode: ReviewModerationReasonCode;
    readonly note: string | null;
  }) => Promise<HideReviewByModerationResult>;
  readonly updateReviewModerationCaseStatus: (input: {
    readonly moderatorUserId: string;
    readonly now: string;
    readonly caseId: string;
    readonly status: "open" | "waiting_client" | "waiting_astrologer" | "consensus_reached";
  }) => Promise<UpdateReviewModerationCaseStatusResult>;
  readonly createReviewCaseMessage: (input: {
    readonly messageId: string;
    readonly caseId: string;
    readonly authorUserId: string | null;
    readonly authorRole: ReviewModerationCaseMessageAuthorRole;
    readonly visibility: ReviewModerationCaseMessageVisibility;
    readonly body: string;
    readonly now: string;
  }) => Promise<CreateReviewCaseMessageResult>;
  readonly reconcileRatingAggregatesForReview: (input: {
    readonly moderatorUserId: string;
    readonly now: string;
    readonly reviewId: string;
  }) => Promise<ReviewRatingAggregateReconciliationResult>;
};

export type ReviewRatingAggregateReconciliationResult =
  | {
      readonly kind: "reconciled";
      readonly reviewId: string;
      readonly astrologerUserId: string;
      readonly productIds: readonly string[];
      readonly aggregateRowsWritten: number;
      readonly reconciledAt: string;
    }
  | {
      readonly kind: "rejected";
      readonly reason: "not_review";
    };

export function createDrizzleReviewCommandStore(
  database: ElevenHouseDatabase
): DrizzleReviewCommandStore {
  return {
    submitReviewVersion: (input) =>
      database.transaction(async (transaction) => {
        const reviewableInstance = await readReviewableInstance(
          transaction,
          input.reviewableInstanceId
        );
        if (!reviewableInstance) return { kind: "rejected", reason: "source_not_reviewable" };

        const existingReviewRow = await readReviewByReviewableInstanceId(
          transaction,
          reviewableInstance.id
        );
        const existingReview = existingReviewRow
          ? await hydrateReviewState(transaction, existingReviewRow)
          : null;
        const planned = planSubmitReviewVersion({
          actorUserId: input.actorUserId,
          now: input.now,
          reviewableInstance: {
            id: reviewableInstance.id,
            clientUserId: reviewableInstance.clientUserId,
            astrologerUserId: reviewableInstance.astrologerUserId,
            status: parseReviewableInstanceStatus(reviewableInstance.status),
            receivedAt: toIso(reviewableInstance.receivedAt),
            reviewWindowClosesAt: toIso(reviewableInstance.reviewWindowClosesAt)
          },
          existingReview,
          nextReviewId: input.nextReviewId,
          nextVersionId: input.nextVersionId,
          submission: input.submission
        });

        if (planned.kind === "rejected") return planned;

        if (planned.kind === "create_review") {
          await transaction.insert(reviews).values({
            id: planned.review.id,
            reviewableInstanceId: planned.review.reviewableInstanceId,
            astrologerUserId: planned.review.astrologerUserId,
            clientUserId: planned.review.clientUserId,
            publicIdentityMode: planned.review.publicIdentityMode,
            revision: planned.review.revision,
            visibilityStatus: planned.review.visibilityStatus,
            disputeStatus: planned.review.disputeStatus,
            pendingVersionId: planned.version.id,
            activePublicVersionId: null,
            activePublicReplyVersionId: null,
            pendingReplyVersionId: null,
            firstPublishedAt: null,
            createdAt: new Date(input.now),
            updatedAt: new Date(input.now)
          });
          await insertReviewVersion(transaction, planned.review.id, planned.version);
          await transaction
            .update(reviewableInstances)
            .set({ status: "review_submitted", updatedAt: new Date(input.now) })
            .where(eq(reviewableInstances.id, reviewableInstance.id));
          return planned;
        }

        await insertReviewVersion(transaction, planned.reviewId, planned.version);
        await transaction
          .update(reviews)
          .set({
            revision: planned.expectedReviewRevision + 1,
            pendingVersionId: planned.version.id,
            updatedAt: new Date(input.now)
          })
          .where(
            and(
              eq(reviews.id, planned.reviewId),
              eq(reviews.revision, planned.expectedReviewRevision)
            )
          );

        return planned;
      }),
    approveReviewVersion: (input) =>
      database.transaction(async (transaction) => {
        await lockReview(transaction, input.reviewId);
        const reviewRow = await readReview(transaction, input.reviewId);
        const versionRow = await readReviewVersion(transaction, input.reviewId, input.versionId);
        if (!reviewRow || !versionRow) return { kind: "rejected", reason: "not_review_version" };

        const currentReview = await hydrateReviewState(transaction, reviewRow);
        const result = approveReviewVersion({
          now: input.now,
          moderatorUserId: input.moderatorUserId,
          review: currentReview,
          version: mapVersion(versionRow)
        });
        if (result.kind === "rejected") return result;
        if (result.kind === "already_approved") return result;

        const reviewableInstance = await readReviewableInstance(
          transaction,
          result.review.reviewableInstanceId
        );
        if (!reviewableInstance) return { kind: "rejected", reason: "not_review_version" };

        await transaction
          .update(reviewVersions)
          .set({
            moderationStatus: "approved",
            moderationReasonCode: null,
            moderationNote: null,
            decidedAt: new Date(input.now),
            decidedByUserId: input.moderatorUserId
          })
          .where(eq(reviewVersions.id, result.version.id));
        await transaction
          .update(reviews)
          .set({
            revision: result.review.revision,
            publicIdentityMode: result.review.publicIdentityMode,
            visibilityStatus: result.review.visibilityStatus,
            firstPublishedAt: result.review.firstPublishedAt
              ? new Date(result.review.firstPublishedAt)
              : null,
            activePublicVersionId: result.review.activePublicVersion?.id ?? null,
            pendingVersionId: result.review.pendingVersion?.id ?? null,
            updatedAt: new Date(input.now)
          })
          .where(eq(reviews.id, result.review.id));
        await applyReviewApprovalAggregateDelta(transaction, {
          astrologerUserId: result.review.astrologerUserId,
          productId: reviewableInstance.productId,
          previousVisibleRating:
            currentReview.visibilityStatus === "visible"
              ? (currentReview.activePublicVersion?.rating ?? null)
              : null,
          nextVisibleRating:
            result.review.visibilityStatus === "visible"
              ? (result.review.activePublicVersion?.rating ?? null)
              : null,
          approvedDelta: currentReview.activePublicVersion ? 0 : 1,
          publishedAt: new Date(input.now),
          updatedAt: new Date(input.now)
        });

        if (result.flowEvent) {
          await transaction.insert(reviewPublicationEvents).values({
            id: input.nextPublicationEventId,
            reviewId: result.flowEvent.reviewId,
            reviewableInstanceId: result.flowEvent.reviewableInstanceId,
            astrologerUserId: result.flowEvent.astrologerUserId,
            clientUserId: result.flowEvent.clientUserId,
            firstApprovedVersionId: result.flowEvent.firstApprovedVersionId,
            occurrenceKey: `review:${result.flowEvent.reviewId}:first-published`,
            publishedAt: new Date(result.flowEvent.publishedAt),
            flowEnrollmentRequestedAt: null,
            createdAt: new Date(input.now)
          });
        }
        await appendReviewAudit(transaction, {
          actorUserId: input.moderatorUserId,
          action: "review.version.approved",
          reviewId: result.review.id,
          occurredAt: input.now,
          metadata: {
            versionId: result.version.id,
            reviewableInstanceId: result.review.reviewableInstanceId,
            previousVisibilityStatus: currentReview.visibilityStatus,
            nextVisibilityStatus: result.review.visibilityStatus,
            firstPublished: Boolean(result.flowEvent)
          }
        });

        return result;
      }),
    rejectReviewVersion: (input) =>
      database.transaction(async (transaction) => {
        await lockReview(transaction, input.reviewId);
        const reviewRow = await readReview(transaction, input.reviewId);
        const versionRow = await readReviewVersion(transaction, input.reviewId, input.versionId);
        if (!reviewRow || !versionRow)
          return { kind: "not_rejected", reason: "not_review_version" };

        const currentReview = await hydrateReviewState(transaction, reviewRow);
        const result = rejectReviewVersion({
          now: input.now,
          moderatorUserId: input.moderatorUserId,
          reasonCode: input.reasonCode,
          note: input.note,
          review: currentReview,
          version: mapVersion(versionRow)
        });
        if (result.kind === "not_rejected") return result;
        if (result.kind === "already_rejected") return result;

        await transaction
          .update(reviewVersions)
          .set({
            moderationStatus: "rejected",
            moderationReasonCode: result.version.moderationReasonCode,
            moderationNote: result.version.moderationNote,
            decidedAt: new Date(input.now),
            decidedByUserId: input.moderatorUserId
          })
          .where(eq(reviewVersions.id, result.version.id));
        await transaction
          .update(reviews)
          .set({
            revision: result.review.revision,
            pendingVersionId: result.review.pendingVersion?.id ?? null,
            updatedAt: new Date(input.now)
          })
          .where(eq(reviews.id, result.review.id));
        await appendReviewAudit(transaction, {
          actorUserId: input.moderatorUserId,
          action: "review.version.rejected",
          reviewId: result.review.id,
          occurredAt: input.now,
          metadata: {
            versionId: result.version.id,
            reviewableInstanceId: result.review.reviewableInstanceId,
            reasonCode: result.version.moderationReasonCode,
            notePresent: Boolean(result.version.moderationNote)
          }
        });

        return result;
      }),
    submitReviewReplyVersion: (input) =>
      database.transaction(async (transaction) => {
        await lockReview(transaction, input.reviewId);
        const reviewRow = await readReview(transaction, input.reviewId);
        if (!reviewRow) return { kind: "rejected", reason: "review_not_public" };

        const currentReview = await hydrateReviewState(transaction, reviewRow);
        const planned = planSubmitReviewReplyVersion({
          actorUserId: input.actorUserId,
          now: input.now,
          review: currentReview,
          nextReplyVersionId: input.nextReplyVersionId,
          text: input.text
        });
        if (planned.kind === "rejected") return planned;

        await insertReviewReplyVersion(
          transaction,
          planned.reviewId,
          currentReview.astrologerUserId,
          planned.replyVersion
        );
        await transaction
          .update(reviews)
          .set({
            revision: planned.expectedReviewRevision + 1,
            pendingReplyVersionId: planned.replyVersion.id,
            updatedAt: new Date(input.now)
          })
          .where(
            and(
              eq(reviews.id, planned.reviewId),
              eq(reviews.revision, planned.expectedReviewRevision)
            )
          );

        return planned;
      }),
    approveReviewReplyVersion: (input) =>
      database.transaction(async (transaction) => {
        await lockReview(transaction, input.reviewId);
        const reviewRow = await readReview(transaction, input.reviewId);
        const replyVersionRow = await readReviewReplyVersion(
          transaction,
          input.reviewId,
          input.replyVersionId
        );
        if (!reviewRow || !replyVersionRow) {
          return { kind: "rejected", reason: "not_review_reply_version" };
        }

        const currentReview = await hydrateReviewState(transaction, reviewRow);
        const result = approveReviewReplyVersion({
          now: input.now,
          moderatorUserId: input.moderatorUserId,
          review: currentReview,
          replyVersion: mapReplyVersion(replyVersionRow)
        });
        if (result.kind === "rejected") return result;
        if (result.kind === "already_approved") return result;

        await transaction
          .update(reviewReplyVersions)
          .set({
            moderationStatus: "approved",
            moderationReasonCode: null,
            moderationNote: null,
            decidedAt: new Date(input.now),
            decidedByUserId: input.moderatorUserId
          })
          .where(eq(reviewReplyVersions.id, result.replyVersion.id));
        await transaction
          .update(reviews)
          .set({
            revision: result.review.revision,
            activePublicReplyVersionId: result.review.activePublicReplyVersion?.id ?? null,
            pendingReplyVersionId: result.review.pendingReplyVersion?.id ?? null,
            updatedAt: new Date(input.now)
          })
          .where(eq(reviews.id, result.review.id));
        await appendReviewAudit(transaction, {
          actorUserId: input.moderatorUserId,
          action: "review.reply_version.approved",
          reviewId: result.review.id,
          occurredAt: input.now,
          metadata: {
            replyVersionId: result.replyVersion.id,
            reviewableInstanceId: result.review.reviewableInstanceId
          }
        });

        return result;
      }),
    rejectReviewReplyVersion: (input) =>
      database.transaction(async (transaction) => {
        await lockReview(transaction, input.reviewId);
        const reviewRow = await readReview(transaction, input.reviewId);
        const replyVersionRow = await readReviewReplyVersion(
          transaction,
          input.reviewId,
          input.replyVersionId
        );
        if (!reviewRow || !replyVersionRow) {
          return { kind: "not_rejected", reason: "not_review_reply_version" };
        }

        const currentReview = await hydrateReviewState(transaction, reviewRow);
        const result = rejectReviewReplyVersion({
          now: input.now,
          moderatorUserId: input.moderatorUserId,
          reasonCode: input.reasonCode,
          note: input.note,
          review: currentReview,
          replyVersion: mapReplyVersion(replyVersionRow)
        });
        if (result.kind === "not_rejected") return result;
        if (result.kind === "already_rejected") return result;

        await transaction
          .update(reviewReplyVersions)
          .set({
            moderationStatus: "rejected",
            moderationReasonCode: result.replyVersion.moderationReasonCode,
            moderationNote: result.replyVersion.moderationNote,
            decidedAt: new Date(input.now),
            decidedByUserId: input.moderatorUserId
          })
          .where(eq(reviewReplyVersions.id, result.replyVersion.id));
        await transaction
          .update(reviews)
          .set({
            revision: result.review.revision,
            pendingReplyVersionId: result.review.pendingReplyVersion?.id ?? null,
            updatedAt: new Date(input.now)
          })
          .where(eq(reviews.id, result.review.id));
        await appendReviewAudit(transaction, {
          actorUserId: input.moderatorUserId,
          action: "review.reply_version.rejected",
          reviewId: result.review.id,
          occurredAt: input.now,
          metadata: {
            replyVersionId: result.replyVersion.id,
            reviewableInstanceId: result.review.reviewableInstanceId,
            reasonCode: result.replyVersion.moderationReasonCode,
            notePresent: Boolean(result.replyVersion.moderationNote)
          }
        });

        return result;
      }),
    openReviewDispute: (input) =>
      database.transaction(async (transaction) => {
        await lockReview(transaction, input.reviewId);
        const reviewRow = await readReview(transaction, input.reviewId);
        if (!reviewRow) return { kind: "rejected", reason: "review_not_public" };

        const currentReview = await hydrateReviewState(transaction, reviewRow);
        const result = openReviewDispute({
          actorUserId: input.actorUserId,
          now: input.now,
          nextCaseId: input.nextCaseId,
          review: currentReview,
          reasonCode: input.reasonCode
        });
        if (result.kind === "rejected") return result;

        const reviewableInstance = await readReviewableInstance(
          transaction,
          result.review.reviewableInstanceId
        );
        if (!reviewableInstance) return { kind: "rejected", reason: "review_not_public" };

        await transaction
          .update(reviews)
          .set({
            revision: result.review.revision,
            visibilityStatus: result.review.visibilityStatus,
            disputeStatus: result.review.disputeStatus,
            updatedAt: new Date(input.now)
          })
          .where(eq(reviews.id, result.review.id));
        await transaction.insert(reviewModerationCases).values({
          id: result.moderationCase.caseId,
          reviewId: result.moderationCase.reviewId,
          status: result.moderationCase.status,
          reasonCode: result.moderationCase.reasonCode,
          openedByUserId: input.actorUserId,
          openedAt: new Date(result.moderationCase.openedAt),
          closedAt: null,
          closedByUserId: null
        });
        const disputeNote = normalizeOptionalNote(input.note ?? null);
        if (disputeNote && input.nextMessageId) {
          await transaction.insert(reviewModerationCaseMessages).values({
            id: input.nextMessageId,
            caseId: result.moderationCase.caseId,
            authorUserId: input.actorUserId,
            authorRole: "astrologer",
            visibility: "astrologer_and_moderators",
            body: disputeNote,
            createdAt: new Date(input.now)
          });
        }
        await applyReviewApprovalAggregateDelta(transaction, {
          astrologerUserId: result.review.astrologerUserId,
          productId: reviewableInstance.productId,
          previousVisibleRating:
            currentReview.visibilityStatus === "visible"
              ? (currentReview.activePublicVersion?.rating ?? null)
              : null,
          nextVisibleRating:
            result.review.visibilityStatus === "visible"
              ? (result.review.activePublicVersion?.rating ?? null)
              : null,
          approvedDelta: 0,
          publishedAt: new Date(input.now),
          updatedAt: new Date(input.now)
        });
        await appendReviewAudit(transaction, {
          actorUserId: input.actorUserId,
          action: "review.dispute.opened",
          reviewId: result.review.id,
          occurredAt: input.now,
          metadata: {
            caseId: result.moderationCase.caseId,
            reasonCode: result.moderationCase.reasonCode,
            notePresent: Boolean(disputeNote),
            reviewableInstanceId: result.review.reviewableInstanceId,
            previousVisibilityStatus: currentReview.visibilityStatus,
            nextVisibilityStatus: result.review.visibilityStatus
          }
        });

        return result;
      }),
    restoreReviewAfterDispute: (input) =>
      database.transaction(async (transaction) => {
        await lockReview(transaction, input.reviewId);
        const reviewRow = await readReview(transaction, input.reviewId);
        if (!reviewRow) return { kind: "rejected", reason: "review_not_public" };

        const currentReview = await hydrateReviewState(transaction, reviewRow);
        const result = restoreReviewAfterDispute({
          now: input.now,
          moderatorUserId: input.moderatorUserId,
          review: currentReview
        });
        if (result.kind === "rejected") return result;

        const reviewableInstance = await readReviewableInstance(
          transaction,
          result.review.reviewableInstanceId
        );
        if (!reviewableInstance) return { kind: "rejected", reason: "review_not_public" };

        await transaction
          .update(reviews)
          .set({
            revision: result.review.revision,
            visibilityStatus: result.review.visibilityStatus,
            disputeStatus: result.review.disputeStatus,
            updatedAt: new Date(input.now)
          })
          .where(eq(reviews.id, result.review.id));
        await closeReviewModerationCase(transaction, {
          caseId: input.caseId,
          reviewId: input.reviewId,
          closedAt: new Date(input.now),
          closedByUserId: input.moderatorUserId
        });
        await applyReviewApprovalAggregateDelta(transaction, {
          astrologerUserId: result.review.astrologerUserId,
          productId: reviewableInstance.productId,
          previousVisibleRating:
            currentReview.visibilityStatus === "visible"
              ? (currentReview.activePublicVersion?.rating ?? null)
              : null,
          nextVisibleRating:
            result.review.visibilityStatus === "visible"
              ? (result.review.activePublicVersion?.rating ?? null)
              : null,
          approvedDelta: 0,
          publishedAt: new Date(input.now),
          updatedAt: new Date(input.now)
        });
        await appendReviewAudit(transaction, {
          actorUserId: input.moderatorUserId,
          action: "review.dispute.restored",
          reviewId: result.review.id,
          occurredAt: input.now,
          metadata: {
            caseId: input.caseId,
            reviewableInstanceId: result.review.reviewableInstanceId,
            previousVisibilityStatus: currentReview.visibilityStatus,
            nextVisibilityStatus: result.review.visibilityStatus
          }
        });

        return result;
      }),
    hideReviewByModeration: (input) =>
      database.transaction(async (transaction) => {
        await lockReview(transaction, input.reviewId);
        const reviewRow = await readReview(transaction, input.reviewId);
        if (!reviewRow) return { kind: "rejected", reason: "review_not_public" };

        const currentReview = await hydrateReviewState(transaction, reviewRow);
        const result = hideReviewByModeration({
          now: input.now,
          moderatorUserId: input.moderatorUserId,
          review: currentReview,
          nextCaseId: input.nextCaseId,
          nextCaseMessageId: input.nextCaseMessageId,
          reasonCode: input.reasonCode,
          note: input.note
        });
        if (result.kind === "rejected") return result;

        const reviewableInstance = await readReviewableInstance(
          transaction,
          result.review.reviewableInstanceId
        );
        if (!reviewableInstance) return { kind: "rejected", reason: "review_not_public" };

        await transaction
          .update(reviews)
          .set({
            revision: result.review.revision,
            visibilityStatus: result.review.visibilityStatus,
            disputeStatus: result.review.disputeStatus,
            updatedAt: new Date(input.now)
          })
          .where(eq(reviews.id, result.review.id));
        if (input.caseId) {
          await closeReviewModerationCase(transaction, {
            caseId: input.caseId,
            reviewId: input.reviewId,
            closedAt: new Date(input.now),
            closedByUserId: input.moderatorUserId
          });
        }
        await transaction.insert(reviewModerationCases).values({
          id: result.moderationCase.caseId,
          reviewId: result.moderationCase.reviewId,
          status: result.moderationCase.status,
          reasonCode: result.moderationCase.reasonCode,
          openedByUserId: input.moderatorUserId,
          openedAt: new Date(result.moderationCase.openedAt),
          closedAt: result.moderationCase.closedAt
            ? new Date(result.moderationCase.closedAt)
            : null,
          closedByUserId: input.moderatorUserId
        });
        if (result.noteMessage) {
          await transaction.insert(reviewModerationCaseMessages).values({
            id: result.noteMessage.messageId,
            caseId: result.noteMessage.caseId,
            authorUserId: result.noteMessage.authorUserId,
            authorRole: result.noteMessage.authorRole,
            visibility: result.noteMessage.visibility,
            body: result.noteMessage.body,
            createdAt: new Date(result.noteMessage.createdAt)
          });
        }
        await applyReviewApprovalAggregateDelta(transaction, {
          astrologerUserId: result.review.astrologerUserId,
          productId: reviewableInstance.productId,
          previousVisibleRating:
            currentReview.visibilityStatus === "visible"
              ? (currentReview.activePublicVersion?.rating ?? null)
              : null,
          nextVisibleRating:
            result.review.visibilityStatus === "visible"
              ? (result.review.activePublicVersion?.rating ?? null)
              : null,
          approvedDelta: 0,
          publishedAt: new Date(input.now),
          updatedAt: new Date(input.now)
        });
        await appendReviewAudit(transaction, {
          actorUserId: input.moderatorUserId,
          action: "review.moderation_hidden",
          reviewId: result.review.id,
          occurredAt: input.now,
          metadata: {
            caseId: result.moderationCase.caseId,
            previousCaseId: input.caseId,
            reviewableInstanceId: result.review.reviewableInstanceId,
            reasonCode: result.moderationCase.reasonCode,
            noteMessageId: result.noteMessage?.messageId ?? null,
            previousVisibilityStatus: currentReview.visibilityStatus,
            nextVisibilityStatus: result.review.visibilityStatus
          }
        });

        return result;
      }),
    updateReviewModerationCaseStatus: (input) =>
      database.transaction(async (transaction) => {
        const moderationCaseRow = await readReviewModerationCase(transaction, input.caseId);
        if (!moderationCaseRow) return { kind: "rejected", reason: "not_review_case" };
        await lockReview(transaction, moderationCaseRow.reviewId);
        const reviewRow = await readReview(transaction, moderationCaseRow.reviewId);
        if (!reviewRow) return { kind: "rejected", reason: "not_review_case" };

        const currentReview = await hydrateReviewState(transaction, reviewRow);
        const result = updateReviewModerationCaseStatus({
          now: input.now,
          moderatorUserId: input.moderatorUserId,
          targetStatus: input.status,
          review: currentReview,
          moderationCase: mapReviewModerationCase(moderationCaseRow)
        });
        if (result.kind === "rejected") return result;
        const changed =
          result.review.revision !== currentReview.revision ||
          result.moderationCase.status !== moderationCaseRow.status;
        if (!changed) return result;

        await transaction
          .update(reviews)
          .set({
            revision: result.review.revision,
            visibilityStatus: result.review.visibilityStatus,
            disputeStatus: result.review.disputeStatus,
            updatedAt: new Date(input.now)
          })
          .where(eq(reviews.id, result.review.id));
        await transaction
          .update(reviewModerationCases)
          .set({
            status: result.moderationCase.status
          })
          .where(eq(reviewModerationCases.id, result.moderationCase.caseId));
        await appendReviewAudit(transaction, {
          actorUserId: input.moderatorUserId,
          action: "review.moderation_case.status_updated",
          reviewId: result.review.id,
          occurredAt: input.now,
          metadata: {
            caseId: result.moderationCase.caseId,
            previousStatus: moderationCaseRow.status,
            status: result.moderationCase.status,
            previousDisputeStatus: reviewRow.disputeStatus,
            nextDisputeStatus: result.review.disputeStatus
          }
        });

        return result;
      }),
    createReviewCaseMessage: (input) =>
      database.transaction(async (transaction) => {
        const moderationCaseRow = await readReviewModerationCase(transaction, input.caseId);
        if (!moderationCaseRow) return { kind: "rejected", reason: "not_review_case" };
        const result = createReviewCaseMessage({
          messageId: input.messageId,
          caseId: input.caseId,
          moderationCase: mapReviewModerationCase(moderationCaseRow),
          authorUserId: input.authorUserId,
          authorRole: input.authorRole,
          visibility: input.visibility,
          body: input.body,
          createdAt: input.now
        });
        if (result.kind === "rejected") return result;

        const [insertedMessage] = await transaction
          .insert(reviewModerationCaseMessages)
          .values({
            id: result.message.messageId,
            caseId: result.message.caseId,
            authorUserId: result.message.authorUserId,
            authorRole: result.message.authorRole,
            visibility: result.message.visibility,
            body: result.message.body,
            createdAt: new Date(result.message.createdAt)
          })
          .onConflictDoNothing({ target: reviewModerationCaseMessages.id })
          .returning();

        if (insertedMessage) {
          await appendReviewAudit(transaction, {
            actorUserId: result.message.authorUserId,
            action: "review.moderation_case.message_created",
            reviewId: moderationCaseRow.reviewId,
            occurredAt: input.now,
            metadata: {
              caseId: result.message.caseId,
              messageId: result.message.messageId,
              authorRole: result.message.authorRole,
              visibility: result.message.visibility
            }
          });
          return result;
        }

        const existingMessage = await readReviewCaseMessage(transaction, result.message.messageId);
        if (existingMessage) {
          return {
            kind: "created",
            message: mapReviewCaseMessage(existingMessage)
          };
        }

        return result;
      }),
    reconcileRatingAggregatesForReview: (input) =>
      database.transaction(async (transaction) => {
        const reviewRow = await readReview(transaction, input.reviewId);
        if (!reviewRow) return { kind: "rejected", reason: "not_review" };

        await lockReviewsForAstrologer(transaction, reviewRow.astrologerUserId);
        const result = await rewriteRatingAggregatesForAstrologer(transaction, {
          astrologerUserId: reviewRow.astrologerUserId,
          updatedAt: new Date(input.now)
        });
        await appendReviewAudit(transaction, {
          actorUserId: input.moderatorUserId,
          action: "review.rating_aggregates.reconciled",
          reviewId: reviewRow.id,
          occurredAt: input.now,
          metadata: {
            astrologerUserId: reviewRow.astrologerUserId,
            productIds: result.productIds,
            aggregateRowsWritten: result.aggregateRowsWritten
          }
        });

        return {
          kind: "reconciled",
          reviewId: reviewRow.id,
          astrologerUserId: reviewRow.astrologerUserId,
          productIds: result.productIds,
          aggregateRowsWritten: result.aggregateRowsWritten,
          reconciledAt: input.now
        };
      })
  };
}

export class ReviewRatingAggregateProjectionDriftError extends Error {
  readonly code = "review_rating_aggregate_projection_drift" as const;

  constructor(readonly scope: "astrologer" | "product") {
    super(`Review rating aggregate projection drift: ${scope}`);
  }
}

async function appendReviewAudit(
  transaction: ReviewCommandTransaction,
  input: {
    readonly actorUserId: string | null;
    readonly action: string;
    readonly reviewId: string;
    readonly occurredAt: string;
    readonly metadata: Record<string, unknown>;
  }
): Promise<void> {
  await transaction.insert(auditLogEntries).values({
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: "review",
    targetId: input.reviewId,
    occurredAt: new Date(input.occurredAt),
    metadata: input.metadata
  });
}

async function lockReview(transaction: ReviewCommandTransaction, reviewId: string): Promise<void> {
  await transaction.execute(sql`select id from reviews where id = ${reviewId} for update`);
}

async function lockReviewsForAstrologer(
  transaction: ReviewCommandTransaction,
  astrologerUserId: string
): Promise<void> {
  await transaction.execute(sql`
    select id
    from reviews
    where astrologer_user_id = ${astrologerUserId}::uuid
    for update
  `);
}

async function rewriteRatingAggregatesForAstrologer(
  transaction: ReviewCommandTransaction,
  input: {
    readonly astrologerUserId: string;
    readonly updatedAt: Date;
  }
): Promise<{ readonly productIds: readonly string[]; readonly aggregateRowsWritten: number }> {
  await transaction
    .delete(reviewRatingAggregates)
    .where(eq(reviewRatingAggregates.astrologerUserId, input.astrologerUserId));

  const astrologerRows = await transaction.execute<{ id: string }>(sql`
    insert into review_rating_aggregates (
      scope,
      astrologer_user_id,
      product_id,
      visible_review_count,
      approved_review_count,
      rating_sum,
      star_1_count,
      star_2_count,
      star_3_count,
      star_4_count,
      star_5_count,
      last_published_at,
      updated_at
    )
    select
      'astrologer',
      r.astrologer_user_id,
      null,
      count(*) filter (where r.visibility_status = 'visible')::integer,
      count(*)::integer,
      coalesce(sum(case when r.visibility_status = 'visible' then rv.rating else 0 end), 0)::integer,
      count(*) filter (where r.visibility_status = 'visible' and rv.rating = 1)::integer,
      count(*) filter (where r.visibility_status = 'visible' and rv.rating = 2)::integer,
      count(*) filter (where r.visibility_status = 'visible' and rv.rating = 3)::integer,
      count(*) filter (where r.visibility_status = 'visible' and rv.rating = 4)::integer,
      count(*) filter (where r.visibility_status = 'visible' and rv.rating = 5)::integer,
      max(case when r.visibility_status = 'visible' then coalesce(r.first_published_at, rv.decided_at) end),
      ${input.updatedAt}
    from reviews r
    join review_versions rv
      on rv.id = r.active_public_version_id
      and rv.review_id = r.id
      and rv.moderation_status = 'approved'
    where r.astrologer_user_id = ${input.astrologerUserId}::uuid
    group by r.astrologer_user_id
    returning id
  `);

  const productRows = await transaction.execute<{ id: string; productId: string }>(sql`
    insert into review_rating_aggregates (
      scope,
      astrologer_user_id,
      product_id,
      visible_review_count,
      approved_review_count,
      rating_sum,
      star_1_count,
      star_2_count,
      star_3_count,
      star_4_count,
      star_5_count,
      last_published_at,
      updated_at
    )
    select
      'product',
      r.astrologer_user_id,
      ri.product_id,
      count(*) filter (where r.visibility_status = 'visible')::integer,
      count(*)::integer,
      coalesce(sum(case when r.visibility_status = 'visible' then rv.rating else 0 end), 0)::integer,
      count(*) filter (where r.visibility_status = 'visible' and rv.rating = 1)::integer,
      count(*) filter (where r.visibility_status = 'visible' and rv.rating = 2)::integer,
      count(*) filter (where r.visibility_status = 'visible' and rv.rating = 3)::integer,
      count(*) filter (where r.visibility_status = 'visible' and rv.rating = 4)::integer,
      count(*) filter (where r.visibility_status = 'visible' and rv.rating = 5)::integer,
      max(case when r.visibility_status = 'visible' then coalesce(r.first_published_at, rv.decided_at) end),
      ${input.updatedAt}
    from reviews r
    join review_versions rv
      on rv.id = r.active_public_version_id
      and rv.review_id = r.id
      and rv.moderation_status = 'approved'
    join reviewable_instances ri
      on ri.id = r.reviewable_instance_id
    where r.astrologer_user_id = ${input.astrologerUserId}::uuid
      and ri.product_id is not null
    group by r.astrologer_user_id, ri.product_id
    returning id, product_id as "productId"
  `);

  return {
    productIds: productRows.rows.map((row) => row.productId),
    aggregateRowsWritten: astrologerRows.rows.length + productRows.rows.length
  };
}

async function readReviewableInstance(
  transaction: ReviewCommandTransaction,
  reviewableInstanceId: string
): Promise<ReviewableInstanceRow | null> {
  const [row] = await transaction
    .select()
    .from(reviewableInstances)
    .where(eq(reviewableInstances.id, reviewableInstanceId));
  return row ?? null;
}

async function readReviewByReviewableInstanceId(
  transaction: ReviewCommandTransaction,
  reviewableInstanceId: string
): Promise<ReviewRow | null> {
  const [row] = await transaction
    .select()
    .from(reviews)
    .where(eq(reviews.reviewableInstanceId, reviewableInstanceId));
  return row ?? null;
}

async function readReview(
  transaction: ReviewCommandTransaction,
  reviewId: string
): Promise<ReviewRow | null> {
  const [row] = await transaction.select().from(reviews).where(eq(reviews.id, reviewId));
  return row ?? null;
}

async function readReviewModerationCase(
  database: ReviewCommandTransaction | ElevenHouseDatabase,
  caseId: string
): Promise<ReviewModerationCaseRow | null> {
  const [row] = await database
    .select()
    .from(reviewModerationCases)
    .where(eq(reviewModerationCases.id, caseId));
  return row ?? null;
}

async function readReviewCaseMessage(
  database: ElevenHouseDatabase,
  messageId: string
): Promise<ReviewModerationCaseMessageRow | null> {
  const [row] = await database
    .select()
    .from(reviewModerationCaseMessages)
    .where(eq(reviewModerationCaseMessages.id, messageId));
  return row ?? null;
}

async function readReviewVersion(
  transaction: ReviewCommandTransaction,
  reviewId: string,
  versionId: string
): Promise<ReviewVersionRow | null> {
  const [row] = await transaction
    .select()
    .from(reviewVersions)
    .where(and(eq(reviewVersions.reviewId, reviewId), eq(reviewVersions.id, versionId)));
  return row ?? null;
}

async function readReviewReplyVersion(
  transaction: ReviewCommandTransaction,
  reviewId: string,
  replyVersionId: string
): Promise<ReviewReplyVersionRow | null> {
  const [row] = await transaction
    .select()
    .from(reviewReplyVersions)
    .where(
      and(eq(reviewReplyVersions.reviewId, reviewId), eq(reviewReplyVersions.id, replyVersionId))
    );
  return row ?? null;
}

async function hydrateReviewState(
  transaction: ReviewCommandTransaction,
  review: ReviewRow
): Promise<ReviewLifecycleState> {
  const activePublicVersion = review.activePublicVersionId
    ? await readReviewVersion(transaction, review.id, review.activePublicVersionId)
    : null;
  const pendingVersion = review.pendingVersionId
    ? await readReviewVersion(transaction, review.id, review.pendingVersionId)
    : null;
  const activePublicReplyVersion = review.activePublicReplyVersionId
    ? await readReviewReplyVersion(transaction, review.id, review.activePublicReplyVersionId)
    : null;
  const pendingReplyVersion = review.pendingReplyVersionId
    ? await readReviewReplyVersion(transaction, review.id, review.pendingReplyVersionId)
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
    firstPublishedAt: review.firstPublishedAt ? toIso(review.firstPublishedAt) : null,
    activePublicVersion: activePublicVersion ? mapVersion(activePublicVersion) : null,
    pendingVersion: pendingVersion ? mapVersion(pendingVersion) : null,
    activePublicReplyVersion: activePublicReplyVersion
      ? mapReplyVersion(activePublicReplyVersion)
      : null,
    pendingReplyVersion: pendingReplyVersion ? mapReplyVersion(pendingReplyVersion) : null
  };
}

async function insertReviewVersion(
  transaction: ReviewCommandTransaction,
  reviewId: string,
  version: ReviewVersionLifecycleState
): Promise<void> {
  await transaction.insert(reviewVersions).values({
    id: version.id,
    reviewId,
    versionNumber: version.versionNumber,
    rating: version.rating,
    text: version.text,
    publicIdentityMode: version.publicIdentityMode,
    moderationStatus: version.moderationStatus,
    moderationReasonCode: null,
    moderationNote: null,
    submittedAt: new Date(version.submittedAt),
    decidedAt: version.decidedAt ? new Date(version.decidedAt) : null,
    decidedByUserId: null,
    createdAt: new Date(version.submittedAt)
  });
}

async function insertReviewReplyVersion(
  transaction: ReviewCommandTransaction,
  reviewId: string,
  astrologerUserId: string,
  replyVersion: ReviewReplyVersionLifecycleState
): Promise<void> {
  await transaction.insert(reviewReplyVersions).values({
    id: replyVersion.id,
    reviewId,
    astrologerUserId,
    versionNumber: replyVersion.versionNumber,
    text: replyVersion.text,
    moderationStatus: replyVersion.moderationStatus,
    moderationReasonCode: null,
    moderationNote: null,
    submittedAt: new Date(replyVersion.submittedAt),
    decidedAt: replyVersion.decidedAt ? new Date(replyVersion.decidedAt) : null,
    decidedByUserId: null,
    createdAt: new Date(replyVersion.submittedAt)
  });
}

async function closeReviewModerationCase(
  transaction: ReviewCommandTransaction,
  input: {
    readonly caseId: string;
    readonly reviewId: string;
    readonly closedAt: Date;
    readonly closedByUserId: string;
  }
): Promise<void> {
  const result = await transaction
    .update(reviewModerationCases)
    .set({
      status: "closed",
      closedAt: input.closedAt,
      closedByUserId: input.closedByUserId
    })
    .where(
      and(
        eq(reviewModerationCases.id, input.caseId),
        eq(reviewModerationCases.reviewId, input.reviewId),
        inArray(reviewModerationCases.status, [
          "open",
          "waiting_client",
          "waiting_astrologer",
          "consensus_reached"
        ])
      )
    )
    .returning({ id: reviewModerationCases.id });
  if (result.length !== 1) {
    throw new Error("review_moderation_case_missing");
  }
}

type ReviewAggregateDeltaInput = {
  readonly astrologerUserId: string;
  readonly productId: string | null;
  readonly previousVisibleRating: number | null;
  readonly nextVisibleRating: number | null;
  readonly approvedDelta: number;
  readonly publishedAt: Date;
  readonly updatedAt: Date;
};

async function applyReviewApprovalAggregateDelta(
  transaction: ReviewCommandTransaction,
  input: ReviewAggregateDeltaInput
): Promise<void> {
  const visibleDelta = (input.nextVisibleRating ? 1 : 0) - (input.previousVisibleRating ? 1 : 0);
  const ratingSumDelta = (input.nextVisibleRating ?? 0) - (input.previousVisibleRating ?? 0);
  const starDeltas = buildStarDeltas(input.previousVisibleRating, input.nextVisibleRating);
  const delta = {
    visibleDelta,
    ratingSumDelta,
    starDeltas
  };
  await writeAstrologerAggregateDelta(transaction, input, delta);
  const productId = input.productId;
  if (productId) {
    await writeProductAggregateDelta(transaction, { ...input, productId }, delta);
  }
}

type ReviewAggregateComputedDelta = {
  readonly visibleDelta: number;
  readonly ratingSumDelta: number;
  readonly starDeltas: readonly [number, number, number, number, number];
};

async function writeAstrologerAggregateDelta(
  transaction: ReviewCommandTransaction,
  input: ReviewAggregateDeltaInput,
  delta: ReviewAggregateComputedDelta
): Promise<void> {
  if (!isInsertableAggregateDelta(input, delta)) {
    await updateAstrologerAggregateDelta(transaction, input, delta);
    return;
  }
  await transaction.execute(sql`
    insert into review_rating_aggregates (
      scope,
      astrologer_user_id,
      product_id,
      visible_review_count,
      approved_review_count,
      rating_sum,
      star_1_count,
      star_2_count,
      star_3_count,
      star_4_count,
      star_5_count,
      last_published_at,
      updated_at
    )
    values (
      'astrologer',
      ${input.astrologerUserId}::uuid,
      null,
      ${delta.visibleDelta},
      ${input.approvedDelta},
      ${delta.ratingSumDelta},
      ${delta.starDeltas[0]},
      ${delta.starDeltas[1]},
      ${delta.starDeltas[2]},
      ${delta.starDeltas[3]},
      ${delta.starDeltas[4]},
      ${input.publishedAt},
      ${input.updatedAt}
    )
    on conflict (astrologer_user_id)
      where scope = 'astrologer' and product_id is null
    do update set
      visible_review_count = review_rating_aggregates.visible_review_count + excluded.visible_review_count,
      approved_review_count = review_rating_aggregates.approved_review_count + excluded.approved_review_count,
      rating_sum = review_rating_aggregates.rating_sum + excluded.rating_sum,
      star_1_count = review_rating_aggregates.star_1_count + excluded.star_1_count,
      star_2_count = review_rating_aggregates.star_2_count + excluded.star_2_count,
      star_3_count = review_rating_aggregates.star_3_count + excluded.star_3_count,
      star_4_count = review_rating_aggregates.star_4_count + excluded.star_4_count,
      star_5_count = review_rating_aggregates.star_5_count + excluded.star_5_count,
      last_published_at = greatest(
        coalesce(review_rating_aggregates.last_published_at, excluded.last_published_at),
        excluded.last_published_at
      ),
      updated_at = excluded.updated_at
  `);
}

async function updateAstrologerAggregateDelta(
  transaction: ReviewCommandTransaction,
  input: ReviewAggregateDeltaInput,
  delta: ReviewAggregateComputedDelta
): Promise<void> {
  const result = await executeAggregateDeltaUpdate("astrologer", () =>
    transaction.execute<{ id: string }>(sql`
      update review_rating_aggregates
      set
        visible_review_count = visible_review_count + ${delta.visibleDelta},
        approved_review_count = approved_review_count + ${input.approvedDelta},
        rating_sum = rating_sum + ${delta.ratingSumDelta},
        star_1_count = star_1_count + ${delta.starDeltas[0]},
        star_2_count = star_2_count + ${delta.starDeltas[1]},
        star_3_count = star_3_count + ${delta.starDeltas[2]},
        star_4_count = star_4_count + ${delta.starDeltas[3]},
        star_5_count = star_5_count + ${delta.starDeltas[4]},
        last_published_at = greatest(coalesce(last_published_at, ${input.publishedAt}), ${input.publishedAt}),
        updated_at = ${input.updatedAt}
      where scope = 'astrologer'
        and astrologer_user_id = ${input.astrologerUserId}::uuid
        and product_id is null
      returning id
    `)
  );
  if (result.rows.length !== 1) {
    throw new ReviewRatingAggregateProjectionDriftError("astrologer");
  }
}

async function writeProductAggregateDelta(
  transaction: ReviewCommandTransaction,
  input: ReviewAggregateDeltaInput & { readonly productId: string },
  delta: ReviewAggregateComputedDelta
): Promise<void> {
  if (!isInsertableAggregateDelta(input, delta)) {
    await updateProductAggregateDelta(transaction, input, delta);
    return;
  }
  await transaction.execute(sql`
    insert into review_rating_aggregates (
      scope,
      astrologer_user_id,
      product_id,
      visible_review_count,
      approved_review_count,
      rating_sum,
      star_1_count,
      star_2_count,
      star_3_count,
      star_4_count,
      star_5_count,
      last_published_at,
      updated_at
    )
    values (
      'product',
      ${input.astrologerUserId}::uuid,
      ${input.productId}::uuid,
      ${delta.visibleDelta},
      ${input.approvedDelta},
      ${delta.ratingSumDelta},
      ${delta.starDeltas[0]},
      ${delta.starDeltas[1]},
      ${delta.starDeltas[2]},
      ${delta.starDeltas[3]},
      ${delta.starDeltas[4]},
      ${input.publishedAt},
      ${input.updatedAt}
    )
    on conflict (astrologer_user_id, product_id)
      where scope = 'product' and product_id is not null
    do update set
      visible_review_count = review_rating_aggregates.visible_review_count + excluded.visible_review_count,
      approved_review_count = review_rating_aggregates.approved_review_count + excluded.approved_review_count,
      rating_sum = review_rating_aggregates.rating_sum + excluded.rating_sum,
      star_1_count = review_rating_aggregates.star_1_count + excluded.star_1_count,
      star_2_count = review_rating_aggregates.star_2_count + excluded.star_2_count,
      star_3_count = review_rating_aggregates.star_3_count + excluded.star_3_count,
      star_4_count = review_rating_aggregates.star_4_count + excluded.star_4_count,
      star_5_count = review_rating_aggregates.star_5_count + excluded.star_5_count,
      last_published_at = greatest(
        coalesce(review_rating_aggregates.last_published_at, excluded.last_published_at),
        excluded.last_published_at
      ),
      updated_at = excluded.updated_at
  `);
}

async function updateProductAggregateDelta(
  transaction: ReviewCommandTransaction,
  input: ReviewAggregateDeltaInput & { readonly productId: string },
  delta: ReviewAggregateComputedDelta
): Promise<void> {
  const result = await executeAggregateDeltaUpdate("product", () =>
    transaction.execute<{ id: string }>(sql`
      update review_rating_aggregates
      set
        visible_review_count = visible_review_count + ${delta.visibleDelta},
        approved_review_count = approved_review_count + ${input.approvedDelta},
        rating_sum = rating_sum + ${delta.ratingSumDelta},
        star_1_count = star_1_count + ${delta.starDeltas[0]},
        star_2_count = star_2_count + ${delta.starDeltas[1]},
        star_3_count = star_3_count + ${delta.starDeltas[2]},
        star_4_count = star_4_count + ${delta.starDeltas[3]},
        star_5_count = star_5_count + ${delta.starDeltas[4]},
        last_published_at = greatest(coalesce(last_published_at, ${input.publishedAt}), ${input.publishedAt}),
        updated_at = ${input.updatedAt}
      where scope = 'product'
        and astrologer_user_id = ${input.astrologerUserId}::uuid
        and product_id = ${input.productId}::uuid
      returning id
    `)
  );
  if (result.rows.length !== 1) {
    throw new ReviewRatingAggregateProjectionDriftError("product");
  }
}

async function executeAggregateDeltaUpdate<T>(
  scope: "astrologer" | "product",
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      hasPostgresConstraintViolation(
        error,
        "23514",
        "review_rating_aggregates_counts_check"
      )
    ) {
      throw new ReviewRatingAggregateProjectionDriftError(scope);
    }
    throw error;
  }
}

function hasPostgresConstraintViolation(error: unknown, code: string, constraint: string): boolean {
  let current: unknown = error;
  const visited = new Set<object>();
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if (
      "code" in current &&
      current.code === code &&
      "constraint" in current &&
      current.constraint === constraint
    ) {
      return true;
    }
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

function isInsertableAggregateDelta(
  input: ReviewAggregateDeltaInput,
  delta: ReviewAggregateComputedDelta
): boolean {
  return (
    input.approvedDelta >= 0 &&
    delta.visibleDelta >= 0 &&
    input.approvedDelta >= delta.visibleDelta &&
    delta.ratingSumDelta >= 0 &&
    delta.starDeltas.every((value) => value >= 0)
  );
}

function buildStarDeltas(
  previousRating: number | null,
  nextRating: number | null
): readonly [number, number, number, number, number] {
  return [1, 2, 3, 4, 5].map(
    (rating) => (nextRating === rating ? 1 : 0) - (previousRating === rating ? 1 : 0)
  ) as [number, number, number, number, number];
}

function mapVersion(row: ReviewVersionRow): ReviewVersionLifecycleState {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    rating: row.rating,
    text: row.text,
    publicIdentityMode: parseReviewPublicIdentityMode(row.publicIdentityMode),
    moderationStatus: parseReviewModerationStatus(row.moderationStatus),
    submittedAt: toIso(row.submittedAt),
    decidedAt: row.decidedAt ? toIso(row.decidedAt) : null
  };
}

function mapReplyVersion(row: ReviewReplyVersionRow): ReviewReplyVersionLifecycleState {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    text: row.text,
    moderationStatus: parseReviewModerationStatus(row.moderationStatus),
    submittedAt: toIso(row.submittedAt),
    decidedAt: row.decidedAt ? toIso(row.decidedAt) : null
  };
}

function mapReviewCaseMessage(
  row: ReviewModerationCaseMessageRow
): ReviewCaseMessageLifecycleState {
  return {
    messageId: row.id,
    caseId: row.caseId,
    authorUserId: row.authorUserId,
    authorRole: reviewModerationCaseMessageAuthorRoleSchema.parse(row.authorRole),
    visibility: reviewModerationCaseMessageVisibilitySchema.parse(row.visibility),
    body: row.body,
    createdAt: toIso(row.createdAt)
  };
}

function mapReviewModerationCase(row: ReviewModerationCaseRow): ReviewModerationCaseLifecycleState {
  return {
    caseId: row.id,
    reviewId: row.reviewId,
    status: row.status as ReviewModerationCaseLifecycleState["status"],
    openedAt: toIso(row.openedAt),
    closedAt: row.closedAt ? toIso(row.closedAt) : null,
    reasonCode: row.reasonCode as ReviewModerationCaseLifecycleState["reasonCode"]
  };
}

function parseReviewableInstanceStatus(value: string): ReviewableInstanceStatus {
  return reviewableInstanceStatusSchema.parse(value);
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

function normalizeOptionalNote(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function toIso(value: Date): string {
  return value.toISOString();
}
