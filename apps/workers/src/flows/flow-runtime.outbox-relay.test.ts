import {
  FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
  FLOW_RUNTIME_EXECUTION_UNAVAILABLE_CODE,
  type ClaimedFlowRuntimeDispatchOutboxEvent,
  type FlowRuntimeDispatchOutboxStore
} from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";
import { describe, expect, it, vi } from "vitest";
import {
  relayPendingFlowRuntimeDispatchEvents,
  type FlowRuntimeOutboxDispatcher
} from "./flow-runtime.outbox-relay";

const eventId = "00000000-0000-4000-8000-000000000001";
const bookingId = "00000000-0000-4000-8000-000000000002";
const ownerUserId = "00000000-0000-4000-8000-000000000003";
const clientUserId = "00000000-0000-4000-8000-000000000004";
const productId = "00000000-0000-4000-8000-000000000005";
const now = new Date("2026-07-17T10:00:00.000Z");
const claimFence = 7n;

describe("relayPendingFlowRuntimeDispatchEvents", () => {
  it("fenced-publishes a booking runtime dispatch after dispatch succeeds", async () => {
    const store = createStore({
      id: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      payload: validPayload(),
      attempts: 1,
      claimFence
    });
    const calls: string[] = [];
    const dispatch = vi.fn(async () => {
      calls.push("dispatch");
      return noMatchingFlow();
    }) satisfies FlowRuntimeOutboxDispatcher;
    vi.mocked(store.markPublished).mockImplementationOnce(async () => {
      calls.push("published");
      return { status: "applied" as const };
    });

    await expect(relayPendingFlowRuntimeDispatchEvents(relayInput(store, dispatch))).resolves.toBe(
      1
    );

    expect(store.claimBatch).toHaveBeenCalledWith({
      limit: 20,
      publishingLockTimeoutMs: 60_000,
      maxAttempts: 3
    });
    expect(dispatch).toHaveBeenCalledWith({ ...validPayload(), now: now.toISOString() });
    expect(store.markPublished).toHaveBeenCalledWith({ eventId, claimFence });
    expect(calls).toEqual(["dispatch", "published"]);
  });

  it("quarantines an aggregate mismatch immediately without leaking payload fields", async () => {
    const store = createStore({
      id: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      payload: {
        ...validPayload(),
        subjectId: "00000000-0000-4000-8000-000000000006",
        payload: { ...validPayload().payload, secret: "do-not-log" }
      },
      attempts: 1,
      claimFence
    });
    const dispatch = vi.fn(async () => noMatchingFlow()) satisfies FlowRuntimeOutboxDispatcher;
    const logger = createLogger();

    await relayPendingFlowRuntimeDispatchEvents({ ...relayInput(store, dispatch), logger });

    expect(dispatch).not.toHaveBeenCalled();
    expect(store.markRetry).not.toHaveBeenCalled();
    expect(store.markQuarantined).toHaveBeenCalledWith({
      eventId,
      claimFence,
      reasonCode: "FLOW_RUNTIME_DISPATCH_AGGREGATE_MISMATCH"
    });
    expect(logger.error).toHaveBeenCalledWith("flow runtime dispatch outbox event quarantined", {
      outboxEventId: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      attempts: 1,
      reasonCode: "FLOW_RUNTIME_DISPATCH_AGGREGATE_MISMATCH"
    });
    expect(vi.mocked(store.markQuarantined).mock.calls[0]?.[0]).not.toHaveProperty("payload");
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain("do-not-log");
  });

  it("quarantines a malformed payload without dispatching or retrying it", async () => {
    const store = createStore({
      id: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      payload: { ownerUserId, secret: "do-not-log" },
      attempts: 1,
      claimFence
    });
    const dispatch = vi.fn(async () => noMatchingFlow()) satisfies FlowRuntimeOutboxDispatcher;

    await relayPendingFlowRuntimeDispatchEvents(relayInput(store, dispatch));

    expect(dispatch).not.toHaveBeenCalled();
    expect(store.markRetry).not.toHaveBeenCalled();
    expect(store.markQuarantined).toHaveBeenCalledWith({
      eventId,
      claimFence,
      reasonCode: "FLOW_RUNTIME_DISPATCH_PAYLOAD_INVALID"
    });
    expect(vi.mocked(store.markQuarantined).mock.calls[0]?.[0]).not.toHaveProperty("payload");
  });

  it("retries a transient dispatch failure below the configured attempt ceiling", async () => {
    const store = createStore({
      id: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      payload: validPayload(),
      attempts: 2,
      claimFence
    });
    const dispatch = vi.fn(async () => {
      throw new Error("temporary database failure: secret=do-not-log");
    }) satisfies FlowRuntimeOutboxDispatcher;
    const logger = createLogger();

    await relayPendingFlowRuntimeDispatchEvents({ ...relayInput(store, dispatch), logger });

    expect(store.markRetry).toHaveBeenCalledWith({
      eventId,
      claimFence,
      retryDelayMs: 2_000,
      reasonCode: "FLOW_RUNTIME_DISPATCH_RETRYABLE_FAILURE"
    });
    expect(store.markQuarantined).not.toHaveBeenCalled();
    expect(vi.mocked(store.markRetry).mock.calls[0]?.[0]).not.toHaveProperty("errorMessage");
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("do-not-log");
  });

  it("quarantines a transient dispatch failure at the configured attempt ceiling", async () => {
    const store = createStore({
      id: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      payload: validPayload(),
      attempts: 3,
      claimFence
    });
    const dispatch = vi.fn(async () => {
      throw new Error("temporary database failure");
    }) satisfies FlowRuntimeOutboxDispatcher;

    await relayPendingFlowRuntimeDispatchEvents(relayInput(store, dispatch));

    expect(store.markRetry).not.toHaveBeenCalled();
    expect(store.markQuarantined).toHaveBeenCalledWith({
      eventId,
      claimFence,
      reasonCode: "FLOW_RUNTIME_DISPATCH_RETRY_EXHAUSTED"
    });
  });

  it("consumes an unavailable matching dispatch without retaining payload for retry", async () => {
    const store = createStore({
      id: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      payload: {
        ...validPayload(),
        payload: { ...validPayload().payload, secret: "do-not-log" }
      },
      attempts: 1,
      claimFence
    });
    const dispatch = vi.fn(async () => ({
      status: "execution_unavailable" as const,
      matchedFlows: 1,
      reasonCode: FLOW_RUNTIME_EXECUTION_UNAVAILABLE_CODE,
      total: 0 as const,
      results: [] as const
    })) satisfies FlowRuntimeOutboxDispatcher;
    const logger = createLogger();

    await expect(
      relayPendingFlowRuntimeDispatchEvents({ ...relayInput(store, dispatch), logger })
    ).resolves.toBe(1);

    expect(store.markPublished).toHaveBeenCalledWith({ eventId, claimFence });
    expect(store.markRetry).not.toHaveBeenCalled();
    expect(store.markQuarantined).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("flow runtime dispatch outbox event ignored", {
      outboxEventId: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      matchedFlows: 1,
      reasonCode: FLOW_RUNTIME_EXECUTION_UNAVAILABLE_CODE
    });
    expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain("do-not-log");
  });

  it("observes a stale publication fence without retrying an already dispatched event", async () => {
    const store = createStore({
      id: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      payload: validPayload(),
      attempts: 1,
      claimFence
    });
    vi.mocked(store.markPublished).mockResolvedValueOnce({ status: "stale" });
    const dispatch = vi.fn(async () => noMatchingFlow()) satisfies FlowRuntimeOutboxDispatcher;
    const logger = createLogger();

    await relayPendingFlowRuntimeDispatchEvents({ ...relayInput(store, dispatch), logger });

    expect(store.markRetry).not.toHaveBeenCalled();
    expect(store.markQuarantined).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("flow runtime dispatch outbox disposition is stale", {
      outboxEventId: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      attemptedDisposition: "published"
    });
  });

  it("alerts once when claim recovery quarantines an exhausted crashed event", async () => {
    const store = createStore({
      id: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      payload: validPayload(),
      attempts: 1,
      claimFence
    });
    vi.mocked(store.claimBatch).mockResolvedValueOnce({
      claimed: [],
      quarantined: [
        {
          id: eventId,
          eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
          aggregateId: bookingId,
          attempts: 3,
          reasonCode: "FLOW_RUNTIME_DISPATCH_RETRY_EXHAUSTED"
        }
      ]
    });
    const dispatch = vi.fn(async () => noMatchingFlow()) satisfies FlowRuntimeOutboxDispatcher;
    const logger = createLogger();

    await expect(
      relayPendingFlowRuntimeDispatchEvents({ ...relayInput(store, dispatch), logger })
    ).resolves.toBe(1);

    expect(dispatch).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith("flow runtime dispatch outbox event quarantined", {
      outboxEventId: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      attempts: 3,
      reasonCode: "FLOW_RUNTIME_DISPATCH_RETRY_EXHAUSTED"
    });
  });
});

function relayInput(store: FlowRuntimeDispatchOutboxStore, dispatch: FlowRuntimeOutboxDispatcher) {
  return {
    store,
    dispatch,
    now,
    batchSize: 20,
    publishingLockTimeoutMs: 60_000,
    maxAttempts: 3
  };
}

function validPayload() {
  return {
    ownerUserId,
    triggerKind: "booking_confirmed" as const,
    source: "booking" as const,
    sourceEventId: `booking:${bookingId}:confirmed`,
    subjectType: "booking" as const,
    subjectId: bookingId,
    occurredAt: "2026-07-17T09:00:00.000Z",
    timeZone: "Europe/Moscow",
    payload: {
      bookingId,
      clientUserId,
      productId,
      startAt: "2026-07-20T07:00:00.000Z",
      endAt: "2026-07-20T08:00:00.000Z"
    }
  };
}

function noMatchingFlow() {
  return {
    status: "no_matching_flow" as const,
    matchedFlows: 0 as const,
    total: 0 as const,
    results: [] as const
  };
}

function createStore(event: ClaimedFlowRuntimeDispatchOutboxEvent) {
  return {
    claimBatch: vi.fn<FlowRuntimeDispatchOutboxStore["claimBatch"]>(async () => ({
      claimed: [event],
      quarantined: []
    })),
    markPublished: vi.fn<FlowRuntimeDispatchOutboxStore["markPublished"]>(async () => ({
      status: "applied"
    })),
    markRetry: vi.fn<FlowRuntimeDispatchOutboxStore["markRetry"]>(async () => ({
      status: "applied"
    })),
    markQuarantined: vi.fn<FlowRuntimeDispatchOutboxStore["markQuarantined"]>(async () => ({
      status: "applied"
    }))
  } satisfies FlowRuntimeDispatchOutboxStore;
}

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}
