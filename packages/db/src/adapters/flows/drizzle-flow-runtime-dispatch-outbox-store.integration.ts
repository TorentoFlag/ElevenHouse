import { randomUUID } from "node:crypto";

import {
  FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT,
  createReviewFirstPublishedFlowEnrollmentRequestedPayload
} from "@elevenhouse/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
import { outboxEvents } from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleFlowRuntimeDispatchOutboxStore } from "./drizzle-flow-runtime-dispatch-outbox-store";

describe.sequential("Drizzle flow runtime dispatch outbox store", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("claims review first-published enrollment requests", async () => {
    const reviewId = randomUUID();
    const payload = createReviewFirstPublishedFlowEnrollmentRequestedPayload({
      reviewId,
      ownerUserId: randomUUID(),
      clientUserId: randomUUID(),
      relationshipId: randomUUID(),
      firstApprovedVersionId: randomUUID(),
      publishedAt: "2026-08-20T11:00:00.000Z"
    });
    await runtime.database.insert(outboxEvents).values({
      eventType: FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT,
      aggregateId: reviewId,
      payload,
      status: "pending",
      availableAt: new Date("2026-08-20T11:00:00.000Z")
    });

    const result = await createDrizzleFlowRuntimeDispatchOutboxStore(runtime.database).claimBatch({
      limit: 10,
      publishingLockTimeoutMs: 60_000,
      maxAttempts: 5
    });

    expect(result.quarantined).toEqual([]);
    expect(result.claimed).toHaveLength(1);
    expect(result.claimed[0]).toMatchObject({
      eventType: FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT,
      aggregateId: reviewId,
      payload
    });
    expect(result.claimed[0]?.attempts).toBe(1);
    expect(result.claimed[0]?.claimFence).toBe(1n);
  });
});
