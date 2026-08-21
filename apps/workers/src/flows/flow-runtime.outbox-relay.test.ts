import { randomUUID } from "node:crypto";

import {
  FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT,
  createReviewFirstPublishedFlowEnrollmentRequestedPayload,
  type ClaimedFlowRuntimeDispatchOutboxEvent,
  type FlowClientEventEnrollmentRequestedPayloadV1,
  type FlowRuntimeDispatchOutboxReason,
  type FlowRuntimeDispatchOutboxStore
} from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";

import { relayPendingFlowRuntimeDispatchEvents } from "./flow-runtime.outbox-relay";

describe("relayPendingFlowRuntimeDispatchEvents", () => {
  it("relays review first-published enrollment events by review aggregate", async () => {
    const reviewId = randomUUID();
    const clientUserId = randomUUID();
    const event: ClaimedFlowRuntimeDispatchOutboxEvent = {
      id: randomUUID(),
      eventType: FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT,
      aggregateId: reviewId,
      payload: createReviewFirstPublishedFlowEnrollmentRequestedPayload({
        reviewId,
        ownerUserId: randomUUID(),
        clientUserId,
        relationshipId: randomUUID(),
        firstApprovedVersionId: randomUUID(),
        publishedAt: "2026-08-20T11:00:00.000Z"
      }),
      attempts: 1,
      claimFence: 1n
    };
    const store = new MemoryFlowRuntimeDispatchOutboxStore(event);
    const enrolledPayloads: FlowClientEventEnrollmentRequestedPayloadV1[] = [];

    const processed = await relayPendingFlowRuntimeDispatchEvents({
      store,
      enrollBookingConfirmed: async () => failUnexpectedDispatcher("booking enrollment"),
      enrollClientEvent: async (payload) => {
        enrolledPayloads.push(payload);
        return {
          status: "enrolled",
          replayed: false,
          eventId: randomUUID(),
          runs: []
        };
      },
      processBookingLifecycleEvent: async () => failUnexpectedDispatcher("booking lifecycle"),
      deliverChartTerminalSignal: async () => failUnexpectedDispatcher("chart terminal"),
      deliverMessagingTerminalSignal: async () => failUnexpectedDispatcher("messaging terminal"),
      recheckBirthProfile: async () => failUnexpectedDispatcher("birth profile recheck"),
      now: new Date("2026-08-20T11:01:00.000Z"),
      batchSize: 10,
      publishingLockTimeoutMs: 60_000,
      maxAttempts: 5,
      enrollmentDeferDelayMs: 30_000
    });

    expect(processed).toBe(1);
    expect(enrolledPayloads).toHaveLength(1);
    expect(enrolledPayloads[0]).toMatchObject({
      eventKind: "review_first_published",
      subjectId: clientUserId,
      occurrenceKey: reviewId,
      payload: { reviewId }
    });
    expect(store.published).toEqual([{ eventId: event.id, claimFence: event.claimFence }]);
    expect(store.quarantined).toEqual([]);
  });
});

class MemoryFlowRuntimeDispatchOutboxStore implements FlowRuntimeDispatchOutboxStore {
  readonly published: { readonly eventId: string; readonly claimFence: bigint }[] = [];
  readonly quarantined: {
    readonly eventId: string;
    readonly claimFence: bigint;
    readonly reasonCode: FlowRuntimeDispatchOutboxReason;
  }[] = [];

  constructor(private readonly event: ClaimedFlowRuntimeDispatchOutboxEvent) {}

  async claimBatch() {
    return { claimed: [this.event], quarantined: [] };
  }

  async markPublished(input: { readonly eventId: string; readonly claimFence: bigint }) {
    this.published.push(input);
    return { status: "applied" as const };
  }

  async markRetry() {
    return { status: "applied" as const };
  }

  async markDeferred() {
    return { status: "applied" as const };
  }

  async markQuarantined(input: {
    readonly eventId: string;
    readonly claimFence: bigint;
    readonly reasonCode: FlowRuntimeDispatchOutboxReason;
  }) {
    this.quarantined.push(input);
    return { status: "applied" as const };
  }
}

function failUnexpectedDispatcher(name: string): never {
  throw new Error(`Unexpected ${name} dispatcher`);
}
