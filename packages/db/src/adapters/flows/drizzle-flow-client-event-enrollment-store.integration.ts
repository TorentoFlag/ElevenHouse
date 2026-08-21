import { randomUUID } from "node:crypto";

import {
  FlowClientEventEnrollmentIntegrityError,
  createReviewFirstPublishedFlowEnrollmentRequestedPayload
} from "@elevenhouse/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
import {
  clientAstrologerRelationships,
  products,
  reviewableInstances,
  users
} from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleReviewCommandStore } from "../reviews/drizzle-review-command-store";
import { createDrizzleFlowClientEventEnrollmentStore } from "./drizzle-flow-client-event-enrollment-store";

describe.sequential("Drizzle flow client event enrollment store", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("rejects review first-published requests without a matching publication event", async () => {
    const relationship = await seedActiveRelationship(runtime);
    const request = createReviewFirstPublishedFlowEnrollmentRequestedPayload({
      reviewId: randomUUID(),
      ownerUserId: relationship.astrologerUserId,
      clientUserId: relationship.clientUserId,
      relationshipId: relationship.relationshipId,
      firstApprovedVersionId: randomUUID(),
      publishedAt: "2026-08-20T11:00:00.000Z"
    });

    await expect(
      createDrizzleFlowClientEventEnrollmentStore(runtime.database).enrollClientEvent({ request })
    ).rejects.toMatchObject({
      name: "FlowClientEventEnrollmentIntegrityError",
      code: "FLOW_CLIENT_EVENT_ENROLLMENT_PAYLOAD_INVALID"
    } satisfies Partial<FlowClientEventEnrollmentIntegrityError>);
  });

  it("accepts review first-published requests backed by a publication event", async () => {
    const fixture = await seedPublishedReviewFixture(runtime);
    const request = createReviewFirstPublishedFlowEnrollmentRequestedPayload({
      reviewId: fixture.reviewId,
      ownerUserId: fixture.astrologerUserId,
      clientUserId: fixture.clientUserId,
      relationshipId: fixture.relationshipId,
      firstApprovedVersionId: fixture.firstVersionId,
      publishedAt: "2026-08-20T11:00:00.000Z"
    });

    await expect(
      createDrizzleFlowClientEventEnrollmentStore(runtime.database).enrollClientEvent({ request })
    ).resolves.toMatchObject({ status: "no_match", replayed: false, runs: [] });
  });
});

async function seedActiveRelationship(runtime: PostgresRuntime) {
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const relationshipId = randomUUID();
  const now = new Date("2026-08-20T09:00:00.000Z");

  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(users).values([{ id: astrologerUserId }, { id: clientUserId }]);
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
  });

  return { astrologerUserId, clientUserId, relationshipId };
}

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
    relationshipId,
    reviewId,
    firstVersionId
  };
}
