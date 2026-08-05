import {
  BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED,
  FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT,
  FlowBookingEnrollmentDeferredError,
  type ClaimedFlowRuntimeDispatchOutboxEvent,
  type FlowRuntimeDispatchOutboxStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";

import {
  relayPendingFlowRuntimeDispatchEvents,
  type FlowBookingEnrollmentDispatcher,
  type FlowBookingLifecycleDispatcher
} from "./flow-runtime.outbox-relay";

const eventId = "00000000-0000-4000-8000-000000000001";
const bookingId = "00000000-0000-4000-8000-000000000002";
const lifecycleEventId = "00000000-0000-4000-8000-000000000003";
const claimFence = 1n;

describe("relayPendingFlowRuntimeDispatchEvents", () => {
  it("publishes a confirmed-booking enrollment only after the durable enrollment outcome", async () => {
    const store = createStore({
      id: eventId,
      eventType: FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT,
      aggregateId: bookingId,
      payload: enrollmentPayload(),
      attempts: 1,
      claimFence
    });
    const enrollBookingConfirmed = vi.fn(async () => enrollmentResult("enrolled"));

    await relayPendingFlowRuntimeDispatchEvents(
      relayInput({ store, enrollBookingConfirmed })
    );

    expect(enrollBookingConfirmed).toHaveBeenCalledWith(enrollmentPayload());
    expect(store.markPublished).toHaveBeenCalledWith({ eventId, claimFence });
    expect(store.markRetry).not.toHaveBeenCalled();
    expect(store.markQuarantined).not.toHaveBeenCalled();
  });

  it("publishes a booking lifecycle event only after its Flow processing outcome", async () => {
    const store = createStore({
      id: eventId,
      eventType: BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED,
      aggregateId: lifecycleEventId,
      payload: lifecyclePayload(),
      attempts: 1,
      claimFence
    });
    const processBookingLifecycleEvent = vi.fn(async () => lifecycleResult());

    await relayPendingFlowRuntimeDispatchEvents(
      relayInput({ store, processBookingLifecycleEvent })
    );

    expect(processBookingLifecycleEvent).toHaveBeenCalledWith(lifecycleEventId);
    expect(store.markPublished).toHaveBeenCalledWith({ eventId, claimFence });
    expect(store.markRetry).not.toHaveBeenCalled();
  });

  it("quarantines an invalid confirmed-booking enrollment envelope before dispatch", async () => {
    const store = createStore({
      id: eventId,
      eventType: FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT,
      aggregateId: bookingId,
      payload: { ...enrollmentPayload(), subjectId: lifecycleEventId },
      attempts: 1,
      claimFence
    });
    const enrollBookingConfirmed = vi.fn(async () => enrollmentResult("no_match"));

    await relayPendingFlowRuntimeDispatchEvents(
      relayInput({ store, enrollBookingConfirmed })
    );

    expect(enrollBookingConfirmed).not.toHaveBeenCalled();
    expect(store.markQuarantined).toHaveBeenCalledWith({
      eventId,
      claimFence,
      reasonCode: "FLOW_BOOKING_ENROLLMENT_PAYLOAD_INVALID"
    });
  });

  it("defers enrollment when booking projection is not ready without consuming retry budget", async () => {
    const store = createStore({
      id: eventId,
      eventType: FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT,
      aggregateId: bookingId,
      payload: enrollmentPayload(),
      attempts: 1,
      claimFence
    });
    const enrollBookingConfirmed = vi.fn(async () => {
      throw new FlowBookingEnrollmentDeferredError();
    });

    await relayPendingFlowRuntimeDispatchEvents(
      relayInput({ store, enrollBookingConfirmed })
    );

    expect(store.markDeferred).toHaveBeenCalledWith({
      eventId,
      claimFence,
      retryDelayMs: 30_000,
      reasonCode: "FLOW_BOOKING_ENROLLMENT_DEFERRED"
    });
    expect(store.markPublished).not.toHaveBeenCalled();
    expect(store.markRetry).not.toHaveBeenCalled();
  });

  it("quarantines an unexpected event type instead of dispatching it", async () => {
    const store = createStore({
      id: eventId,
      eventType: "unrelated.event.v1",
      aggregateId: bookingId,
      payload: {},
      attempts: 1,
      claimFence
    });
    const enrollBookingConfirmed = vi.fn(async () => enrollmentResult("no_match"));
    const processBookingLifecycleEvent = vi.fn(async () => lifecycleResult());

    await relayPendingFlowRuntimeDispatchEvents(
      relayInput({ store, enrollBookingConfirmed, processBookingLifecycleEvent })
    );

    expect(enrollBookingConfirmed).not.toHaveBeenCalled();
    expect(processBookingLifecycleEvent).not.toHaveBeenCalled();
    expect(store.markQuarantined).toHaveBeenCalledWith({
      eventId,
      claimFence,
      reasonCode: "FLOW_RUNTIME_DISPATCH_EVENT_TYPE_UNSUPPORTED"
    });
  });
});

function relayInput(input: {
  readonly store: FlowRuntimeDispatchOutboxStore;
  readonly enrollBookingConfirmed?: FlowBookingEnrollmentDispatcher;
  readonly processBookingLifecycleEvent?: FlowBookingLifecycleDispatcher;
}) {
  return {
    store: input.store,
    enrollBookingConfirmed: input.enrollBookingConfirmed ?? (async () => enrollmentResult("no_match")),
    processBookingLifecycleEvent:
      input.processBookingLifecycleEvent ?? (async () => lifecycleResult()),
    now: new Date("2026-08-05T00:00:00.000Z"),
    batchSize: 20,
    publishingLockTimeoutMs: 60_000,
    maxAttempts: 3,
    enrollmentDeferDelayMs: 30_000
  };
}

function enrollmentPayload() {
  return {
    schemaVersion: "flow-booking-confirmed-enrollment-request.v1" as const,
    eventKind: "booking_confirmed" as const,
    source: "booking" as const,
    sourceEventId: `booking:${bookingId}:confirmed`,
    subjectType: "booking" as const,
    subjectId: bookingId,
    occurrenceKey: bookingId,
    occurredAt: "2026-08-05T00:00:00.000Z",
    payloadSchemaVersion: 1 as const,
    payload: { bookingId }
  };
}

function lifecyclePayload() {
  return {
    schemaVersion: "booking-lifecycle-event-dispatch-request.v1" as const,
    lifecycleEventId
  };
}

function enrollmentResult(status: "enrolled" | "no_match") {
  return {
    status,
    replayed: false,
    eventId: "00000000-0000-4000-8000-000000000004",
    runs: []
  } as const;
}

function lifecycleResult() {
  return {
    lifecycleEventId,
    bookingId,
    ownerUserId: "00000000-0000-4000-8000-000000000005",
    appliedRevision: 1,
    eventKind: "confirmed" as const,
    outcome: "enrolled" as const,
    replayed: false,
    affectedRunCount: 1,
    affectedWorkItemCount: 0,
    preservedCompletedWorkItemCount: 0
  };
}

function createStore(
  event: ClaimedFlowRuntimeDispatchOutboxEvent
): FlowRuntimeDispatchOutboxStore {
  return {
    claimBatch: vi.fn(async () => ({ claimed: [event], quarantined: [] })),
    markPublished: vi.fn(async () => ({ status: "applied" as const })),
    markRetry: vi.fn(async () => ({ status: "applied" as const })),
    markDeferred: vi.fn(async () => ({ status: "applied" as const })),
    markQuarantined: vi.fn(async () => ({ status: "applied" as const }))
  };
}
