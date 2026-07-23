import { describe, expect, it, vi } from "vitest";
import { createMessagingRealtimeClient } from "./messagingRealtimeClient";

describe("createMessagingRealtimeClient", () => {
  it("creates EventSource for the messaging SSE endpoint and dispatches typed events", () => {
    const source = new FakeEventSource();
    const eventSourceFactory = vi.fn(() => source as unknown as EventSource);
    const onEvent = vi.fn();
    const client = createMessagingRealtimeClient({
      baseUrl: "/api",
      onEvent,
      eventSourceFactory
    });

    source.emit("message.received", {
      eventId: "42",
      type: "message.received",
      occurredAt: "2026-07-22T10:00:00.000Z",
      threadId: "44444444-4444-4444-8444-444444444444",
      messageId: "77777777-7777-4777-8777-777777777777"
    });

    expect(eventSourceFactory).toHaveBeenCalledWith("/api/messaging/events");
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: "42",
      type: "message.received"
    }));

    client.close();
    expect(source.closed).toBe(true);
  });

  it("routes invalid event payloads and EventSource errors to onError", () => {
    const source = new FakeEventSource();
    const onError = vi.fn();
    createMessagingRealtimeClient({
      baseUrl: "/api/",
      onEvent: vi.fn(),
      onError,
      eventSourceFactory: () => source as unknown as EventSource
    });

    source.emit("message.updated", { eventId: "43", type: "message.updated" });
    source.onerror?.(new Event("error"));

    expect(onError).toHaveBeenCalledTimes(2);
  });
});

class FakeEventSource {
  closed = false;
  onerror: ((event: Event) => void) | null = null;
  private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback = typeof listener === "function"
      ? listener
      : (event: Event) => listener.handleEvent(event);
    this.listeners.set(type, [
      ...(this.listeners.get(type) ?? []),
      callback as (event: MessageEvent) => void
    ]);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: unknown): void {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}
