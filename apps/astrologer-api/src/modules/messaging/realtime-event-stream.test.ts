import type { MessageEvent } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { MessagingReadStore, MessagingRealtimeEvent } from "@elevenhouse/domain";
import {
  createMessagingRealtimeEventStream,
  parseMessagingLastEventId
} from "./realtime-event-stream";

const astrologerUserId = "22222222-2222-4222-8222-222222222222";
type StoredRealtimeEvent = MessagingRealtimeEvent & { readonly astrologerUserId: string };

const event: StoredRealtimeEvent = {
  eventId: "42",
  astrologerUserId,
  type: "message.received" as const,
  occurredAt: "2026-07-22T10:00:00.000Z",
  threadId: "44444444-4444-4444-8444-444444444444",
  messageId: "77777777-7777-4777-8777-777777777777",
  channelConnectionId: "55555555-5555-4555-8555-555555555555",
  externalIdentityId: undefined
};

describe("messaging realtime event stream", () => {
  it("maps owner-scoped stored events to SSE MessageEvent objects", async () => {
    const store = createStore([event]);
    const messages: MessageEvent[] = [];

    const subscription = createMessagingRealtimeEventStream({
      readStore: store,
      astrologerUserId,
      lastEventId: undefined,
      pollIntervalMs: 60_000,
      heartbeatIntervalMs: 60_000
    }).subscribe((message) => messages.push(message));
    await flushPromises();
    subscription.unsubscribe();

    expect(store.listRealtimeEvents).toHaveBeenCalledWith({
      astrologerUserId,
      afterEventId: undefined,
      limit: 100
    });
    expect(messages).toEqual([
      {
        id: "42",
        type: "message.received",
        data: {
          eventId: "42",
          type: "message.received",
          occurredAt: "2026-07-22T10:00:00.000Z",
          threadId: "44444444-4444-4444-8444-444444444444",
          messageId: "77777777-7777-4777-8777-777777777777",
          channelConnectionId: "55555555-5555-4555-8555-555555555555",
          externalIdentityId: undefined
        }
      }
    ]);
  });

  it("rejects invalid Last-Event-ID values", () => {
    expect(() => parseMessagingLastEventId("42")).not.toThrow();
    expect(() => parseMessagingLastEventId("  ")).toThrow("Invalid messaging Last-Event-ID");
    expect(() => parseMessagingLastEventId("-1")).toThrow("Invalid messaging Last-Event-ID");
    expect(() => parseMessagingLastEventId("abc")).toThrow("Invalid messaging Last-Event-ID");
    expect(() => parseMessagingLastEventId("9223372036854775808")).toThrow(
      "Invalid messaging Last-Event-ID"
    );
  });

  it("polls after the latest emitted event id", async () => {
    const store = createStore([event], [{ ...event, eventId: "43", type: "message.updated" as const }]);
    const messages: MessageEvent[] = [];

    vi.useFakeTimers();
    const subscription = createMessagingRealtimeEventStream({
      readStore: store,
      astrologerUserId,
      lastEventId: "41",
      pollIntervalMs: 1000,
      heartbeatIntervalMs: 60_000
    }).subscribe((message) => messages.push(message));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1000);
    subscription.unsubscribe();
    vi.useRealTimers();

    expect(store.listRealtimeEvents).toHaveBeenNthCalledWith(1, {
      astrologerUserId,
      afterEventId: "41",
      limit: 100
    });
    expect(store.listRealtimeEvents).toHaveBeenNthCalledWith(2, {
      astrologerUserId,
      afterEventId: "42",
      limit: 100
    });
    expect(messages.map((message) => message.id)).toEqual(["42", "43"]);
  });

  it("emits heartbeat events on idle interval", async () => {
    const store = createStore([]);
    const messages: MessageEvent[] = [];

    vi.useFakeTimers();
    const subscription = createMessagingRealtimeEventStream({
      readStore: store,
      astrologerUserId,
      lastEventId: undefined,
      pollIntervalMs: 60_000,
      heartbeatIntervalMs: 1000
    }).subscribe((message) => messages.push(message));
    await vi.advanceTimersByTimeAsync(1000);
    subscription.unsubscribe();
    vi.useRealTimers();

    expect(messages).toEqual([{ type: "heartbeat", data: { ok: true } }]);
  });

  it("stops polling and heartbeats after unsubscribe", async () => {
    const store = createStore([]);
    const messages: MessageEvent[] = [];

    vi.useFakeTimers();
    const subscription = createMessagingRealtimeEventStream({
      readStore: store,
      astrologerUserId,
      lastEventId: undefined,
      pollIntervalMs: 1000,
      heartbeatIntervalMs: 1000
    }).subscribe((message) => messages.push(message));
    await flushPromises();
    subscription.unsubscribe();
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();

    expect(store.listRealtimeEvents).toHaveBeenCalledTimes(1);
    expect(messages).toEqual([]);
  });
});

function createStore(
  firstBatch: readonly StoredRealtimeEvent[],
  secondBatch: readonly StoredRealtimeEvent[] = []
): MessagingReadStore {
  let calls = 0;
  return {
    listChannelConnections: vi.fn(async () => ({ channelConnections: [] })),
    listTelegramBusinessConnectionReconciliationCandidates: vi.fn(async () => ({ candidates: [] })),
    listThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
    getThread: vi.fn(async () => null),
    findMessageMediaSource: vi.fn(async () => null),
    listRealtimeEvents: vi.fn(async () => ({
      events: calls++ === 0 ? firstBatch : secondBatch
    }))
  };
}

function flushPromises(): Promise<void> {
  return Promise.resolve();
}
