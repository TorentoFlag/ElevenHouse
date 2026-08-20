import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
import {
  clientAstrologerRelationships,
  products,
  reviewAiReplyDrafts,
  reviewReplyVersions,
  reviewableInstances,
  reviews,
  users
} from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleReviewAiReplyDraftStore } from "./drizzle-review-ai-reply-draft-store";
import { createDrizzleReviewCommandStore } from "./drizzle-review-command-store";

describe.sequential("Drizzle review AI reply draft store", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("persists draft-only AI reply commands and completions without submitting replies", async () => {
    const fixture = await seedPublishedReview(runtime);
    const store = createDrizzleReviewAiReplyDraftStore(runtime.database);
    const draftId = randomUUID();
    const attemptId = randomUUID();

    const created = await store.createReplyDraftCommand({
      actorUserId: fixture.astrologerUserId,
      now: "2026-08-20T12:00:00.000Z",
      reviewId: fixture.reviewId,
      nextDraftId: draftId,
      attemptId
    });

    expect(created).toMatchObject({
      kind: "created",
      command: {
        attemptId,
        feature: "reviews.reply_draft",
        promptId: "reviews.replyDraft",
        promptVersion: 1,
        provider: "openai",
        outputMode: "draft_only",
        canSubmitOrPublish: false,
        ownerSafetyId: fixture.astrologerUserId,
        promptInput: {
          rating: 5,
          reviewText: "Помогло понять следующие шаги.",
          publicIdentityMode: "secret_user",
          serviceTitle: "Солярная консультация",
          serviceContextLabel: "60 минут"
        }
      }
    });

    const [pendingDraft] = await runtime.database
      .select()
      .from(reviewAiReplyDrafts)
      .where(eq(reviewAiReplyDrafts.id, draftId));
    expect(pendingDraft).toMatchObject({
      reviewId: fixture.reviewId,
      astrologerUserId: fixture.astrologerUserId,
      aiUsageAttemptId: attemptId,
      status: "pending",
      promptId: "reviews.replyDraft",
      promptVersion: 1,
      draftText: null,
      safeErrorCode: null,
      completedAt: null
    });

    const completed = await store.markReplyDraftSucceeded({
      attemptId,
      now: "2026-08-20T12:01:00.000Z",
      draftText: "Спасибо за обратную связь. Рад, что консультация помогла."
    });
    expect(completed).toEqual({ kind: "updated" });

    const [succeededDraft] = await runtime.database
      .select()
      .from(reviewAiReplyDrafts)
      .where(eq(reviewAiReplyDrafts.id, draftId));
    expect(succeededDraft).toMatchObject({
      status: "succeeded",
      draftText: "Спасибо за обратную связь. Рад, что консультация помогла.",
      safeErrorCode: null,
      completedAt: new Date("2026-08-20T12:01:00.000Z")
    });

    const [replyVersionCount] = await runtime.database
      .select({ value: count() })
      .from(reviewReplyVersions)
      .where(eq(reviewReplyVersions.reviewId, fixture.reviewId));
    expect(replyVersionCount?.value).toBe(0);
    const [reviewRow] = await runtime.database
      .select()
      .from(reviews)
      .where(eq(reviews.id, fixture.reviewId));
    expect(reviewRow).toMatchObject({
      activePublicReplyVersionId: null,
      pendingReplyVersionId: null
    });
  });
});

async function seedPublishedReview(runtime: PostgresRuntime) {
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const moderatorUserId = randomUUID();
  const relationshipId = randomUUID();
  const productId = randomUUID();
  const reviewableInstanceId = randomUUID();
  const reviewId = randomUUID();
  const versionId = randomUUID();
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

  const commandStore = createDrizzleReviewCommandStore(runtime.database);
  await commandStore.submitReviewVersion({
    actorUserId: clientUserId,
    now: "2026-08-20T10:00:00.000Z",
    reviewableInstanceId,
    nextReviewId: reviewId,
    nextVersionId: versionId,
    submission: {
      rating: 5,
      text: "Помогло понять следующие шаги.",
      publicIdentityMode: "secret_user"
    }
  });
  await commandStore.approveReviewVersion({
    moderatorUserId,
    now: "2026-08-20T11:00:00.000Z",
    reviewId,
    versionId,
    nextPublicationEventId: randomUUID()
  });

  return {
    astrologerUserId,
    reviewId
  };
}
