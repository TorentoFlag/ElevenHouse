import {
  BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED,
  CHART_CALCULATION_TERMINAL_EVENT,
  CLIENT_BIRTH_PROFILE_UPDATED_EVENT,
  FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT,
  FlowBookingEnrollmentDeferredError,
  type ClaimedFlowRuntimeDispatchOutboxEvent,
  type FlowRuntimeDispatchOutboxStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";

import {
  relayPendingFlowRuntimeDispatchEvents,
  type FlowChartTerminalSignalDispatcher,
  type FlowMessagingTerminalSignalDispatcher,
  type FlowBookingEnrollmentDispatcher,
  type FlowBookingLifecycleDispatcher,
  type FlowBirthProfileRecheckDispatcher
} from "./flow-runtime.outbox-relay";

const eventId = "00000000-0000-4000-8000-000000000001";
const bookingId = "00000000-0000-4000-8000-000000000002";
const lifecycleEventId = "00000000-0000-4000-8000-000000000003";
const chartJobId = "00000000-0000-4000-8000-000000000004";
const ownerUserId = "00000000-0000-4000-8000-000000000005";
const birthDataHistoryId = "00000000-0000-4000-8000-000000000006";
const birthDataId = "00000000-0000-4000-8000-000000000007";
const clientUserId = "00000000-0000-4000-8000-000000000008";
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

  it("delivers a validated chart terminal signal before publishing its outbox event", async () => {
    const store = createStore({
      id: eventId,
      eventType: CHART_CALCULATION_TERMINAL_EVENT,
      aggregateId: chartJobId,
      payload: chartTerminalPayload(),
      attempts: 1,
      claimFence
    });
    const deliverChartTerminalSignal = vi.fn(async () => ({ status: "consumed" as const }));

    await relayPendingFlowRuntimeDispatchEvents(relayInput({ store, deliverChartTerminalSignal }));

    expect(deliverChartTerminalSignal).toHaveBeenCalledWith({
      ...chartTerminalPayload(),
      sourceEventId: eventId
    });
    expect(store.markPublished).toHaveBeenCalledWith({ eventId, claimFence });
    expect(store.markRetry).not.toHaveBeenCalled();
    expect(store.markQuarantined).not.toHaveBeenCalled();
  });

  it("delivers a validated messaging terminal signal before publishing its outbox event", async () => {
    const messageId = "00000000-0000-4000-8000-000000000009";
    const payload = {
      schemaVersion: "messaging-message-delivery-terminal.v1" as const,
      messageId,
      ownerUserId,
      outcome: "failed" as const,
      occurredAt: "2026-08-05T00:00:00.000Z"
    };
    const store = createStore({
      id: eventId,
      eventType: "messaging.message.delivery_terminal.v1",
      aggregateId: messageId,
      payload,
      attempts: 1,
      claimFence
    });
    const deliverMessagingTerminalSignal = vi.fn(async () => ({ status: "consumed" as const }));

    await relayPendingFlowRuntimeDispatchEvents(
      relayInput({ store, deliverMessagingTerminalSignal })
    );

    expect(deliverMessagingTerminalSignal).toHaveBeenCalledWith({ ...payload, sourceEventId: eventId });
    expect(store.markPublished).toHaveBeenCalledWith({ eventId, claimFence });
    expect(store.markRetry).not.toHaveBeenCalled();
  });

  it("quarantines an invalid chart terminal payload before durable signal delivery", async () => {
    const store = createStore({
      id: eventId,
      eventType: CHART_CALCULATION_TERMINAL_EVENT,
      aggregateId: chartJobId,
      payload: { ...chartTerminalPayload(), outcome: "unknown" },
      attempts: 1,
      claimFence
    });
    const deliverChartTerminalSignal = vi.fn(async () => ({ status: "consumed" as const }));

    await relayPendingFlowRuntimeDispatchEvents(relayInput({ store, deliverChartTerminalSignal }));

    expect(deliverChartTerminalSignal).not.toHaveBeenCalled();
    expect(store.markPublished).not.toHaveBeenCalled();
    expect(store.markQuarantined).toHaveBeenCalledWith({
      eventId,
      claimFence,
      reasonCode: "FLOW_CHART_TERMINAL_PAYLOAD_INVALID"
    });
  });

  it("quarantines a chart terminal event whose aggregate does not match its job", async () => {
    const store = createStore({
      id: eventId,
      eventType: CHART_CALCULATION_TERMINAL_EVENT,
      aggregateId: bookingId,
      payload: chartTerminalPayload(),
      attempts: 1,
      claimFence
    });
    const deliverChartTerminalSignal = vi.fn(async () => ({ status: "consumed" as const }));

    await relayPendingFlowRuntimeDispatchEvents(relayInput({ store, deliverChartTerminalSignal }));

    expect(deliverChartTerminalSignal).not.toHaveBeenCalled();
    expect(store.markPublished).not.toHaveBeenCalled();
    expect(store.markQuarantined).toHaveBeenCalledWith({
      eventId,
      claimFence,
      reasonCode: "FLOW_CHART_TERMINAL_AGGREGATE_MISMATCH"
    });
  });

  it("retries the outbox event when durable signal delivery fails", async () => {
    const store = createStore({
      id: eventId,
      eventType: CHART_CALCULATION_TERMINAL_EVENT,
      aggregateId: chartJobId,
      payload: chartTerminalPayload(),
      attempts: 1,
      claimFence
    });
    const deliverChartTerminalSignal = vi.fn(async () => {
      throw new Error("inbox unavailable");
    });

    await relayPendingFlowRuntimeDispatchEvents(relayInput({ store, deliverChartTerminalSignal }));

    expect(store.markPublished).not.toHaveBeenCalled();
    expect(store.markQuarantined).not.toHaveBeenCalled();
    expect(store.markRetry).toHaveBeenCalledWith({
      eventId,
      claimFence,
      retryDelayMs: 1_000,
      reasonCode: "FLOW_RUNTIME_DISPATCH_RETRYABLE_FAILURE"
    });
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

  it("rechecks the redacted singleton profile before publishing its outbox event", async () => {
    const store = createStore({
      id: eventId,
      eventType: CLIENT_BIRTH_PROFILE_UPDATED_EVENT,
      aggregateId: birthDataHistoryId,
      payload: birthProfilePayload(),
      attempts: 1,
      claimFence
    });
    const recheckBirthProfile = vi.fn(async () => birthProfileRecheckResult("ready"));

    await relayPendingFlowRuntimeDispatchEvents(relayInput({ store, recheckBirthProfile }));

    expect(recheckBirthProfile).toHaveBeenCalledWith({
      sourceOutboxEventId: eventId,
      event: birthProfilePayload()
    });
    expect(store.markPublished).toHaveBeenCalledWith({ eventId, claimFence });
    expect(store.markRetry).not.toHaveBeenCalled();
    expect(store.markQuarantined).not.toHaveBeenCalled();
  });

  it("quarantines an invalid birth-profile payload before rechecking any Flow", async () => {
    const store = createStore({
      id: eventId,
      eventType: CLIENT_BIRTH_PROFILE_UPDATED_EVENT,
      aggregateId: birthDataHistoryId,
      payload: { ...birthProfilePayload(), revision: 0 },
      attempts: 1,
      claimFence
    });
    const recheckBirthProfile = vi.fn(async () => birthProfileRecheckResult("ready"));

    await relayPendingFlowRuntimeDispatchEvents(relayInput({ store, recheckBirthProfile }));

    expect(recheckBirthProfile).not.toHaveBeenCalled();
    expect(store.markQuarantined).toHaveBeenCalledWith({
      eventId,
      claimFence,
      reasonCode: "FLOW_BIRTH_PROFILE_RECHECK_PAYLOAD_INVALID"
    });
  });

  it("quarantines a birth-profile event whose aggregate is not its history revision", async () => {
    const store = createStore({
      id: eventId,
      eventType: CLIENT_BIRTH_PROFILE_UPDATED_EVENT,
      aggregateId: birthDataId,
      payload: birthProfilePayload(),
      attempts: 1,
      claimFence
    });
    const recheckBirthProfile = vi.fn(async () => birthProfileRecheckResult("ready"));

    await relayPendingFlowRuntimeDispatchEvents(relayInput({ store, recheckBirthProfile }));

    expect(recheckBirthProfile).not.toHaveBeenCalled();
    expect(store.markQuarantined).toHaveBeenCalledWith({
      eventId,
      claimFence,
      reasonCode: "FLOW_BIRTH_PROFILE_RECHECK_AGGREGATE_MISMATCH"
    });
  });

  it("retries the birth-profile event when its durable recheck is temporarily unavailable", async () => {
    const store = createStore({
      id: eventId,
      eventType: CLIENT_BIRTH_PROFILE_UPDATED_EVENT,
      aggregateId: birthDataHistoryId,
      payload: birthProfilePayload(),
      attempts: 1,
      claimFence
    });
    const recheckBirthProfile = vi.fn(async () => {
      throw new Error("database unavailable");
    });

    await relayPendingFlowRuntimeDispatchEvents(relayInput({ store, recheckBirthProfile }));

    expect(store.markPublished).not.toHaveBeenCalled();
    expect(store.markQuarantined).not.toHaveBeenCalled();
    expect(store.markRetry).toHaveBeenCalledWith({
      eventId,
      claimFence,
      retryDelayMs: 1_000,
      reasonCode: "FLOW_RUNTIME_DISPATCH_RETRYABLE_FAILURE"
    });
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
  readonly deliverChartTerminalSignal?: FlowChartTerminalSignalDispatcher;
  readonly deliverMessagingTerminalSignal?: FlowMessagingTerminalSignalDispatcher;
  readonly recheckBirthProfile?: FlowBirthProfileRecheckDispatcher;
}) {
  return {
    store: input.store,
    enrollBookingConfirmed: input.enrollBookingConfirmed ?? (async () => enrollmentResult("no_match")),
    processBookingLifecycleEvent:
      input.processBookingLifecycleEvent ?? (async () => lifecycleResult()),
    deliverChartTerminalSignal: input.deliverChartTerminalSignal ?? (async () => ({ status: "stored" })),
    deliverMessagingTerminalSignal:
      input.deliverMessagingTerminalSignal ?? (async () => ({ status: "stored" })),
    recheckBirthProfile:
      input.recheckBirthProfile ??
      (async ({ sourceOutboxEventId, event }) => ({
        sourceOutboxEventId,
        profileHistoryId: event.birthDataHistoryId,
        outcome: "stale" as const,
        replayed: false,
        affectedRunCount: 0
      })),
    now: new Date("2026-08-05T00:00:00.000Z"),
    batchSize: 20,
    publishingLockTimeoutMs: 60_000,
    maxAttempts: 3,
    enrollmentDeferDelayMs: 30_000
  };
}

function chartTerminalPayload() {
  return {
    jobId: chartJobId,
    ownerUserId,
    outcome: "succeeded" as const,
    occurredAt: "2026-08-05T00:00:00.000Z"
  };
}

function birthProfilePayload() {
  return {
    schemaVersion: "client-birth-profile-updated.v1" as const,
    birthDataHistoryId,
    birthDataId,
    clientUserId,
    revision: 1,
    actorUserId: clientUserId,
    actorRole: "client" as const,
    occurredAt: "2026-08-05T00:00:00.000Z"
  };
}

function birthProfileRecheckResult(outcome: "ready" | "not_ready" | "stale") {
  return {
    sourceOutboxEventId: eventId,
    profileHistoryId: birthDataHistoryId,
    outcome,
    replayed: false,
    affectedRunCount: outcome === "ready" ? 1 : 0
  } as const;
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
    ownerUserId,
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
