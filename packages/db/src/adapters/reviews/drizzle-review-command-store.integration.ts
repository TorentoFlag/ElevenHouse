import { randomUUID } from "node:crypto";

import { count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
import {
  clientAstrologerRelationships,
  reviewPublicationEvents,
  reviewVersions,
  reviewableInstances,
  reviews,
  products,
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
    await expectAstrologerAggregate(runtime, fixture.astrologerUserId, {
      visibleReviewCount: 1,
      approvedReviewCount: 1,
      ratingSum: 5,
      star4Count: 0,
      star5Count: 1
    });
    await expectProductAggregate(runtime, fixture.astrologerUserId, fixture.productId, {
      visibleReviewCount: 1,
      approvedReviewCount: 1,
      ratingSum: 5,
      star4Count: 0,
      star5Count: 1
    });

    const submittedReply = await store.submitReviewReplyVersion({
      actorUserId: fixture.astrologerUserId,
      now: "2026-08-20T12:00:00.000Z",
      reviewId: fixture.reviewId,
      nextReplyVersionId: fixture.firstReplyVersionId,
      text: "Спасибо за отзыв."
    });

    expect(submittedReply).toMatchObject({
      kind: "create_pending_reply_version",
      keepActivePublicReplyVersionId: null,
      replyVersion: {
        id: fixture.firstReplyVersionId,
        versionNumber: 1,
        moderationStatus: "pending"
      }
    });

    const [pendingReplyReviewRow] = await runtime.database
      .select()
      .from(reviews)
      .where(eq(reviews.id, fixture.reviewId));
    expect(pendingReplyReviewRow).toMatchObject({
      activePublicReplyVersionId: null,
      pendingReplyVersionId: fixture.firstReplyVersionId
    });

    const approvedReply = await store.approveReviewReplyVersion({
      moderatorUserId: fixture.moderatorUserId,
      now: "2026-08-20T13:00:00.000Z",
      reviewId: fixture.reviewId,
      replyVersionId: fixture.firstReplyVersionId
    });

    expect(approvedReply).toMatchObject({
      kind: "approved",
      review: {
        activePublicReplyVersion: { id: fixture.firstReplyVersionId },
        pendingReplyVersion: null
      },
      replyVersion: {
        id: fixture.firstReplyVersionId,
        moderationStatus: "approved"
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
        revision: 6,
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
      revision: 6,
      activePublicVersionId: fixture.editVersionId,
      pendingVersionId: null,
      publicIdentityMode: "secret_user",
      visibilityStatus: "visible"
    });
    await expectAstrologerAggregate(runtime, fixture.astrologerUserId, {
      visibleReviewCount: 1,
      approvedReviewCount: 1,
      ratingSum: 4,
      star4Count: 1,
      star5Count: 0
    });
    await expectProductAggregate(runtime, fixture.astrologerUserId, fixture.productId, {
      visibleReviewCount: 1,
      approvedReviewCount: 1,
      ratingSum: 4,
      star4Count: 1,
      star5Count: 0
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

  it("rejects pending review versions without publishing or updating aggregates", async () => {
    const fixture = await seedReviewableFixture(runtime);
    const store = createDrizzleReviewCommandStore(runtime.database);

    const submitted = await store.submitReviewVersion({
      actorUserId: fixture.clientUserId,
      now: "2026-08-20T10:00:00.000Z",
      reviewableInstanceId: fixture.reviewableInstanceId,
      nextReviewId: fixture.reviewId,
      nextVersionId: fixture.firstVersionId,
      submission: {
        rating: 2,
        text: "Текст не относится к услуге.",
        publicIdentityMode: "named"
      }
    });
    expect(submitted.kind).toBe("create_review");

    const rejected = await store.rejectReviewVersion({
      moderatorUserId: fixture.moderatorUserId,
      now: "2026-08-20T11:00:00.000Z",
      reviewId: fixture.reviewId,
      versionId: fixture.firstVersionId,
      reasonCode: "off_topic",
      note: "Не про оказанную услугу."
    });

    expect(rejected).toMatchObject({
      kind: "rejected",
      review: {
        revision: 2,
        visibilityStatus: "not_public",
        activePublicVersion: null,
        pendingVersion: null
      },
      version: {
        id: fixture.firstVersionId,
        moderationStatus: "rejected",
        moderationReasonCode: "off_topic",
        moderationNote: "Не про оказанную услугу.",
        decidedByUserId: fixture.moderatorUserId
      }
    });

    const [reviewRow] = await runtime.database
      .select()
      .from(reviews)
      .where(eq(reviews.id, fixture.reviewId));
    expect(reviewRow).toMatchObject({
      revision: 2,
      activePublicVersionId: null,
      pendingVersionId: null,
      visibilityStatus: "not_public"
    });

    const [versionRow] = await runtime.database
      .select()
      .from(reviewVersions)
      .where(eq(reviewVersions.id, fixture.firstVersionId));
    expect(versionRow).toMatchObject({
      moderationStatus: "rejected",
      moderationReasonCode: "off_topic",
      moderationNote: "Не про оказанную услугу.",
      decidedByUserId: fixture.moderatorUserId
    });

    const [publicationCount] = await runtime.database
      .select({ value: count() })
      .from(reviewPublicationEvents)
      .where(eq(reviewPublicationEvents.reviewId, fixture.reviewId));
    expect(publicationCount?.value).toBe(0);
    await expectNoAstrologerAggregate(runtime, fixture.astrologerUserId);
  });
});

async function seedReviewableFixture(runtime: PostgresRuntime) {
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const moderatorUserId = randomUUID();
  const relationshipId = randomUUID();
  const reviewableInstanceId = randomUUID();
  const productId = randomUUID();
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

  return {
    astrologerUserId,
    clientUserId,
    moderatorUserId,
    relationshipId,
    productId,
    reviewableInstanceId,
    reviewId: randomUUID(),
    firstVersionId: randomUUID(),
    editVersionId: randomUUID(),
    firstReplyVersionId: randomUUID(),
    publicationEventId: randomUUID()
  };
}

type AstrologerAggregateExpectation = {
  readonly visibleReviewCount: number;
  readonly approvedReviewCount: number;
  readonly ratingSum: number;
  readonly star4Count: number;
  readonly star5Count: number;
};

async function expectAstrologerAggregate(
  runtime: PostgresRuntime,
  astrologerUserId: string,
  expectation: AstrologerAggregateExpectation
): Promise<void> {
  const result = await runtime.database.execute<AstrologerAggregateExpectation>(sql`
    select
      visible_review_count as "visibleReviewCount",
      approved_review_count as "approvedReviewCount",
      rating_sum as "ratingSum",
      star_4_count as "star4Count",
      star_5_count as "star5Count"
    from review_rating_aggregates
    where scope = 'astrologer'
      and astrologer_user_id = ${astrologerUserId}
      and product_id is null
  `);
  expect(result.rows).toEqual([expectation]);
}

async function expectProductAggregate(
  runtime: PostgresRuntime,
  astrologerUserId: string,
  productId: string,
  expectation: AstrologerAggregateExpectation
): Promise<void> {
  const result = await runtime.database.execute<AstrologerAggregateExpectation>(sql`
    select
      visible_review_count as "visibleReviewCount",
      approved_review_count as "approvedReviewCount",
      rating_sum as "ratingSum",
      star_4_count as "star4Count",
      star_5_count as "star5Count"
    from review_rating_aggregates
    where scope = 'product'
      and astrologer_user_id = ${astrologerUserId}
      and product_id = ${productId}
  `);
  expect(result.rows).toEqual([expectation]);
}

async function expectNoAstrologerAggregate(
  runtime: PostgresRuntime,
  astrologerUserId: string
): Promise<void> {
  const result = await runtime.database.execute<AstrologerAggregateExpectation>(sql`
    select
      visible_review_count as "visibleReviewCount",
      approved_review_count as "approvedReviewCount",
      rating_sum as "ratingSum",
      star_4_count as "star4Count",
      star_5_count as "star5Count"
    from review_rating_aggregates
    where scope = 'astrologer'
      and astrologer_user_id = ${astrologerUserId}
      and product_id is null
  `);
  expect(result.rows).toEqual([]);
}
