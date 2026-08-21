import { randomUUID } from "node:crypto";

import {
  FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT,
  flowReviewFirstPublishedEnrollmentRequestedPayloadV1Schema
} from "@elevenhouse/domain";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
import {
  clientAstrologerRelationships,
  outboxEvents,
  products,
  reviewPublicationEvents,
  reviewableInstances,
  users
} from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleReviewCommandStore } from "./drizzle-review-command-store";
import { createDrizzleReviewPublicationFlowOutboxStore } from "./drizzle-review-publication-flow-outbox-store";

describe.sequential("Drizzle review publication flow outbox store", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("publishes first review approval to the flow runtime outbox once", async () => {
    const fixture = await seedPublishedReviewFixture(runtime);
    const store = createDrizzleReviewPublicationFlowOutboxStore(runtime.database);

    const result = await store.publishPendingFirstPublicationEnrollments({
      limit: 10,
      now: "2026-08-20T11:05:00.000Z"
    });

    expect(result).toEqual({ scanned: 1, created: 1, rejected: 0 });

    const [outboxRow] = await runtime.database
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.eventType, FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT));
    expect(outboxRow).toMatchObject({
      eventType: FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT,
      aggregateId: fixture.reviewId,
      status: "pending",
      attempts: 0
    });
    expect(outboxRow?.availableAt).toEqual(new Date("2026-08-20T11:05:00.000Z"));
    expect(
      flowReviewFirstPublishedEnrollmentRequestedPayloadV1Schema.parse(outboxRow?.payload)
    ).toMatchObject({
      eventKind: "review_first_published",
      sourceEventId: `review:${fixture.reviewId}:first_published`,
      subjectId: fixture.clientUserId,
      occurrenceKey: fixture.reviewId,
      occurredAt: "2026-08-20T11:00:00.000Z",
      payload: {
        reviewId: fixture.reviewId,
        relationshipId: fixture.relationshipId,
        firstApprovedVersionId: fixture.firstVersionId
      }
    });

    const [publicationRow] = await runtime.database
      .select()
      .from(reviewPublicationEvents)
      .where(eq(reviewPublicationEvents.reviewId, fixture.reviewId));
    expect(publicationRow?.flowEnrollmentRequestedAt).toEqual(
      new Date("2026-08-20T11:05:00.000Z")
    );

    await expect(
      store.publishPendingFirstPublicationEnrollments({
        limit: 10,
        now: "2026-08-20T11:06:00.000Z"
      })
    ).resolves.toEqual({ scanned: 0, created: 0, rejected: 0 });

    const [outboxCount] = await runtime.database
      .select({ value: count() })
      .from(outboxEvents)
      .where(eq(outboxEvents.eventType, FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT));
    expect(outboxCount?.value).toBe(1);
  });
});

async function seedPublishedReviewFixture(runtime: PostgresRuntime) {
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const moderatorUserId = randomUUID();
  const relationshipId = randomUUID();
  const productId = randomUUID();
  const reviewableInstanceId = randomUUID();
  const reviewId = randomUUID();
  const firstVersionId = randomUUID();
  const now = new Date("2026-08-20T09:00:00.000Z");

  await runtime.database.transaction(async (transaction) => {
    await transaction
      .insert(users)
      .values([{ id: astrologerUserId }, { id: clientUserId }, { id: moderatorUserId }]);
    await transaction.insert(clientAstrologerRelationships).values({
      id: relationshipId,
      astrologerUserId,
      clientUserId,
      source: "booking",
      status: "active",
      firstLinkedAt: now,
      lastLinkedAt: now,
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(products).values({
      id: productId,
      ownerUserId: astrologerUserId,
      type: "single",
      status: "active",
      revision: 1,
      title: "Солярная консультация",
      priceMinor: 12000,
      currency: "RUB",
      executionMode: "live",
      paymentModel: "once",
      durationMinutes: 60,
      participantMode: "solo",
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(reviewableInstances).values({
      id: reviewableInstanceId,
      astrologerUserId,
      clientUserId,
      relationshipId,
      kind: "booking",
      status: "reviewable",
      windowPolicy: "standard_14_days_after_receipt",
      sourceResourceKey: `booking:${randomUUID()}`,
      productId,
      orderId: null,
      bookingId: null,
      titleSnapshot: "Солярная консультация",
      contextLabelSnapshot: "60 минут",
      receivedAt: new Date("2026-08-19T10:00:00.000Z"),
      reviewWindowClosesAt: new Date("2026-09-02T10:00:00.000Z"),
      blockedReasonCode: null,
      createdAt: now,
      updatedAt: now
    });
  });

  const commandStore = createDrizzleReviewCommandStore(runtime.database);
  await commandStore.submitReviewVersion({
    actorUserId: clientUserId,
    now: "2026-08-20T10:00:00.000Z",
    reviewableInstanceId,
    nextReviewId: reviewId,
    nextVersionId: firstVersionId,
    submission: {
      rating: 5,
      text: "Очень полезная консультация.",
      publicIdentityMode: "named"
    }
  });
  await commandStore.approveReviewVersion({
    moderatorUserId,
    now: "2026-08-20T11:00:00.000Z",
    reviewId,
    versionId: firstVersionId,
    nextPublicationEventId: randomUUID()
  });

  return {
    astrologerUserId,
    clientUserId,
    moderatorUserId,
    relationshipId,
    productId,
    reviewableInstanceId,
    reviewId,
    firstVersionId
  };
}
