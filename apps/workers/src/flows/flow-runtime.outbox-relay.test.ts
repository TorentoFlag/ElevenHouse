import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import { FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT } from "@elevenhouse/domain";
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

describe("relayPendingFlowRuntimeDispatchEvents", () => {
  it("marks a booking flow runtime dispatch event published after dispatch succeeds", async () => {
    const store = createStore({
      id: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      payload: validPayload(),
      attempts: 0
    });
    const calls: string[] = [];
    const dispatch = vi.fn(async () => {
      calls.push("dispatch");
    }) satisfies FlowRuntimeOutboxDispatcher;
    vi.mocked(store.markPublished).mockImplementationOnce(async () => {
      calls.push("published");
    });

    await expect(relayPendingFlowRuntimeDispatchEvents(relayInput(store, dispatch))).resolves.toBe(
      1
    );

    expect(store.claimPending).toHaveBeenCalledWith({
      eventTypes: [FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT],
      limit: 20,
      now,
      stalePublishingBefore: new Date("2026-07-17T09:59:00.000Z")
    });
    expect(dispatch).toHaveBeenCalledWith({ ...validPayload(), now: now.toISOString() });
    expect(calls).toEqual(["dispatch", "published"]);
  });

  it("returns failed dispatches to the outbox retry path without leaking payload fields", async () => {
    const store = createStore({
      id: eventId,
      eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
      aggregateId: bookingId,
      payload: {
        ...validPayload(),
        subjectId: "00000000-0000-4000-8000-000000000006",
        payload: { ...validPayload().payload, secret: "do-not-log" }
      },
      attempts: 2
    });
    const dispatch = vi.fn(async () => undefined) satisfies FlowRuntimeOutboxDispatcher;

    await relayPendingFlowRuntimeDispatchEvents(relayInput(store, dispatch));

    expect(dispatch).not.toHaveBeenCalled();
    expect(store.markPublished).not.toHaveBeenCalled();
    expect(store.markPublishFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId,
        nextAvailableAt: new Date("2026-07-17T10:00:04.000Z"),
        errorMessage: "Flow runtime dispatch aggregate does not match booking subject"
      })
    );
    expect(JSON.stringify(vi.mocked(store.markPublishFailed).mock.calls)).not.toContain(
      "do-not-log"
    );
  });
});

function relayInput(store: OutboxRelayStore, dispatch: FlowRuntimeOutboxDispatcher) {
  return {
    store,
    dispatch,
    now,
    batchSize: 20,
    publishingLockTimeoutMs: 60_000
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

function createStore(event: Awaited<ReturnType<OutboxRelayStore["claimPending"]>>[number]) {
  return {
    claimPending: vi.fn(async () => [event]),
    markPublished: vi.fn(async () => undefined),
    markPublishFailed: vi.fn(async () => undefined)
  } satisfies OutboxRelayStore;
}
