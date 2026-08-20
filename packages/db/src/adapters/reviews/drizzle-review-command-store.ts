import {
  reviewDisputeStatusSchema,
  reviewModerationStatusSchema,
  reviewPublicIdentityModeSchema,
  reviewableInstanceStatusSchema,
  reviewVisibilityStatusSchema,
  type ReviewDisputeStatus,
  type ReviewModerationStatus,
  type ReviewPublicIdentityMode,
  type ReviewableInstanceStatus,
  type ReviewVisibilityStatus
} from "@elevenhouse/contracts";
import {
  approveReviewVersion,
  planSubmitReviewVersion,
  type ApproveReviewVersionResult,
  type ReviewLifecycleState,
  type ReviewSubmissionLifecycleInput,
  type ReviewVersionLifecycleState,
  type SubmitReviewVersionResult
} from "@elevenhouse/domain";
import { and, eq, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  reviewPublicationEvents,
  reviewVersions,
  reviewableInstances,
  reviews
} from "../../schema";

type ReviewCommandTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type ReviewRow = typeof reviews.$inferSelect;
type ReviewVersionRow = typeof reviewVersions.$inferSelect;
type ReviewableInstanceRow = typeof reviewableInstances.$inferSelect;

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

        return result;
      })
  };
}

async function lockReview(transaction: ReviewCommandTransaction, reviewId: string): Promise<void> {
  await transaction.execute(sql`select id from reviews where id = ${reviewId} for update`);
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

async function hydrateReviewState(
  transaction: ReviewCommandTransaction,
  review: ReviewRow
): Promise<ReviewLifecycleState> {
  const [activePublicVersion, pendingVersion] = await Promise.all([
    review.activePublicVersionId
      ? readReviewVersion(transaction, review.id, review.activePublicVersionId)
      : Promise.resolve(null),
    review.pendingVersionId
      ? readReviewVersion(transaction, review.id, review.pendingVersionId)
      : Promise.resolve(null)
  ]);
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
    activePublicReplyVersion: null,
    pendingReplyVersion: null
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

function toIso(value: Date): string {
  return value.toISOString();
}
