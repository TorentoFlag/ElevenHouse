import {
  FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT,
  createReviewFirstPublishedFlowEnrollmentRequestedPayload
} from "@elevenhouse/domain";
import { asc, eq, inArray, isNull } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { outboxEvents, reviewPublicationEvents, reviewableInstances } from "../../schema";

export type ReviewPublicationFlowOutboxProjectionResult = {
  readonly scanned: number;
  readonly created: number;
  readonly rejected: number;
};

type PendingPublicationRow = {
  readonly id: string;
  readonly reviewId: string;
  readonly reviewableInstanceId: string;
  readonly astrologerUserId: string;
  readonly clientUserId: string;
  readonly firstApprovedVersionId: string;
  readonly publishedAt: Date;
  readonly relationshipId: string;
};

export function createDrizzleReviewPublicationFlowOutboxStore(database: ElevenHouseDatabase) {
  return {
    publishPendingFirstPublicationEnrollments: async (input: {
      readonly limit: number;
      readonly now: string;
    }): Promise<ReviewPublicationFlowOutboxProjectionResult> => {
      assertPositiveInteger(input.limit, "limit", 500);
      const now = new Date(input.now);
      if (Number.isNaN(now.getTime())) {
        throw new Error("Review publication flow outbox projection now must be a valid ISO date");
      }

      return database.transaction(async (transaction) => {
        const pendingRows = await transaction
          .select({
            id: reviewPublicationEvents.id,
            reviewId: reviewPublicationEvents.reviewId,
            reviewableInstanceId: reviewPublicationEvents.reviewableInstanceId,
            astrologerUserId: reviewPublicationEvents.astrologerUserId,
            clientUserId: reviewPublicationEvents.clientUserId,
            firstApprovedVersionId: reviewPublicationEvents.firstApprovedVersionId,
            publishedAt: reviewPublicationEvents.publishedAt,
            relationshipId: reviewableInstances.relationshipId
          })
          .from(reviewPublicationEvents)
          .innerJoin(
            reviewableInstances,
            eq(reviewableInstances.id, reviewPublicationEvents.reviewableInstanceId)
          )
          .where(isNull(reviewPublicationEvents.flowEnrollmentRequestedAt))
          .orderBy(asc(reviewPublicationEvents.publishedAt), asc(reviewPublicationEvents.id))
          .limit(input.limit)
          .for("update", { of: reviewPublicationEvents, skipLocked: true });

        if (pendingRows.length === 0) {
          return { scanned: 0, created: 0, rejected: 0 };
        }

        const rows = pendingRows as readonly PendingPublicationRow[];
        const insertResult = await transaction
          .insert(outboxEvents)
          .values(
            rows.map((row) => ({
              eventType: FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT,
              aggregateId: row.reviewId,
              payload: createReviewFirstPublishedFlowEnrollmentRequestedPayload({
                reviewId: row.reviewId,
                ownerUserId: row.astrologerUserId,
                clientUserId: row.clientUserId,
                relationshipId: row.relationshipId,
                firstApprovedVersionId: row.firstApprovedVersionId,
                publishedAt: row.publishedAt.toISOString()
              }),
              status: "pending",
              attempts: 0,
              availableAt: now,
              createdAt: now,
              updatedAt: now
            }))
          )
          .onConflictDoNothing({
            target: [outboxEvents.eventType, outboxEvents.aggregateId]
          })
          .returning({ id: outboxEvents.id });

        await transaction
          .update(reviewPublicationEvents)
          .set({ flowEnrollmentRequestedAt: now })
          .where(inArray(reviewPublicationEvents.id, rows.map((row) => row.id)));

        return {
          scanned: rows.length,
          created: insertResult.length,
          rejected: rows.length - insertResult.length
        };
      });
    }
  };
}

function assertPositiveInteger(value: number, name: string, max?: number): void {
  if (!Number.isInteger(value) || value < 1 || (max !== undefined && value > max)) {
    throw new Error(
      max === undefined
        ? `${name} must be a positive integer`
        : `${name} must be a positive integer not greater than ${max}`
    );
  }
}
