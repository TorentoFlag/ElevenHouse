import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
import {
  clientAstrologerRelationships,
  reviewPublicationEvents,
  reviewVersions,
  reviewableInstances,
  reviews,
  users
} from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleReviewCommandStore } from "./drizzle-review-command-store";

describe.sequential("Drizzle review command store", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("submits, publishes first review once, and does not duplicate publication events for edits", async () => {
    const fixture = await seedReviewableFixture(runtime);
    const store = createDrizzleReviewCommandStore(runtime.database);

    const submitted = await store.submitReviewVersion({
      actorUserId: fixture.clientUserId,
      now: "2026-08-20T10:00:00.000Z",
      reviewableInstanceId: fixture.reviewableInstanceId,
      nextReviewId: fixture.reviewId,
      nextVersionId: fixture.firstVersionId,
      submission: {
        rating: 5,
        text: "Очень полезная консультация.",
        publicIdentityMode: "named"
      }
    });

    expect(submitted).toMatchObject({
      kind: "create_review",
      review: {
        id: fixture.reviewId,
        revision: 1,
        visibilityStatus: "not_public",
        pendingVersion: { id: fixture.firstVersionId }
      }
    });

    const firstApproval = await store.approveReviewVersion({
      moderatorUserId: fixture.moderatorUserId,
      now: "2026-08-20T11:00:00.000Z",
      reviewId: fixture.reviewId,
      versionId: fixture.firstVersionId,
      nextPublicationEventId: fixture.publicationEventId
    });

    expect(firstApproval).toMatchObject({
      kind: "approved",
      review: {
        revision: 2,
        visibilityStatus: "visible",
        activePublicVersion: { id: fixture.firstVersionId },
        pendingVersion: null
      },
      flowEvent: {
        eventType: "review_first_published",
        firstApprovedVersionId: fixture.firstVersionId
      }
    });

    const edit = await store.submitReviewVersion({
      actorUserId: fixture.clientUserId,
      now: "2026-08-21T10:00:00.000Z",
      reviewableInstanceId: fixture.reviewableInstanceId,
      nextReviewId: fixture.reviewId,
      nextVersionId: fixture.editVersionId,
      submission: {
        rating: 4,
        text: "Обновленный текст после публикации.",
        publicIdentityMode: "secret_user"
      }
    });

    expect(edit).toMatchObject({
      kind: "create_pending_version",
      keepActivePublicVersionId: fixture.firstVersionId,
      version: { id: fixture.editVersionId, versionNumber: 2 }
    });

    const [pendingEditReviewRow] = await runtime.database
      .select()
      .from(reviews)
      .where(eq(reviews.id, fixture.reviewId));
    expect(pendingEditReviewRow).toMatchObject({
      activePublicVersionId: fixture.firstVersionId,
      pendingVersionId: fixture.editVersionId,
      publicIdentityMode: "named"
    });

    const editApproval = await store.approveReviewVersion({
      moderatorUserId: fixture.moderatorUserId,
      now: "2026-08-21T11:00:00.000Z",
      reviewId: fixture.reviewId,
      versionId: fixture.editVersionId,
      nextPublicationEventId: randomUUID()
    });

    expect(editApproval).toMatchObject({
      kind: "approved",
      review: {
        revision: 4,
        activePublicVersion: { id: fixture.editVersionId },
        pendingVersion: null
      },
      flowEvent: null
    });

    const [reviewRow] = await runtime.database
      .select()
      .from(reviews)
      .where(eq(reviews.id, fixture.reviewId));
    expect(reviewRow).toMatchObject({
      revision: 4,
      activePublicVersionId: fixture.editVersionId,
      pendingVersionId: null,
      publicIdentityMode: "secret_user",
      visibilityStatus: "visible"
    });

    const [publicationCount] = await runtime.database
      .select({ value: count() })
      .from(reviewPublicationEvents)
      .where(eq(reviewPublicationEvents.reviewId, fixture.reviewId));
    expect(publicationCount?.value).toBe(1);

    const versionRows = await runtime.database
      .select()
      .from(reviewVersions)
      .where(eq(reviewVersions.reviewId, fixture.reviewId));
    expect(versionRows.map((row) => [row.id, row.moderationStatus])).toEqual(
      expect.arrayContaining([
        [fixture.firstVersionId, "approved"],
        [fixture.editVersionId, "approved"]
      ])
    );
  });
});

async function seedReviewableFixture(runtime: PostgresRuntime) {
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const moderatorUserId = randomUUID();
  const relationshipId = randomUUID();
  const reviewableInstanceId = randomUUID();
  const now = new Date("2026-08-20T09:00:00.000Z");

  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(users).values([
      { id: astrologerUserId },
      { id: clientUserId },
      { id: moderatorUserId }
    ]);
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
    await transaction.insert(reviewableInstances).values({
      id: reviewableInstanceId,
      astrologerUserId,
      clientUserId,
      relationshipId,
      kind: "booking",
      status: "reviewable",
      windowPolicy: "standard_14_days_after_receipt",
      sourceResourceKey: `booking:${randomUUID()}`,
      productId: null,
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

  return {
    astrologerUserId,
    clientUserId,
    moderatorUserId,
    relationshipId,
    reviewableInstanceId,
    reviewId: randomUUID(),
    firstVersionId: randomUUID(),
    editVersionId: randomUUID(),
    publicationEventId: randomUUID()
  };
}
