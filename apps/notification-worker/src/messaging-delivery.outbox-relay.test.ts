import { describe, expect, it, vi } from "vitest";
import {
  messagingMessageDeliveryReconciliationRequestedEventType,
  messagingMessageDeliveryRequestedEventType
} from "@elevenhouse/domain";
import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import { createLogger, type LogRecord } from "@elevenhouse/observability";
import { relayPendingMessagingOutboxEvents } from "./messaging-delivery.outbox-relay";
import { messagingDeliveryJobName, type MessagingDeliveryQueue } from "./messaging-delivery.queue";

const claimFence = 13n;

describe("relayPendingMessagingOutboxEvents", () => {
  it("claims only messaging delivery events and marks them published after queue add", async () => {
    const now = new Date("2026-07-22T10:00:00.000Z");
    const store: OutboxRelayStore = {
      claimPending: vi.fn(async () => [
        {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          eventType: messagingMessageDeliveryRequestedEventType,
          aggregateId: "9e14390f-3db1-4d1c-9344-55679c778427",
          payload: {
            messageId: "9e14390f-3db1-4d1c-9344-55679c778427",
            threadId: "7e14390f-3db1-4d1c-9344-55679c778427",
            channelConnectionId: "6e14390f-3db1-4d1c-9344-55679c778427",
            astrologerUserId: "5e14390f-3db1-4d1c-9344-55679c778427"
          },
          attempts: 0,
          claimFence
        }
      ]),
      markPublished: vi.fn(async () => undefined),
      markPublishFailed: vi.fn(async () => undefined),
      markQuarantined: vi.fn(async () => undefined)
    };
    const queue = { add: vi.fn(async () => undefined) } as unknown as MessagingDeliveryQueue;
    const logRecords: LogRecord[] = [];

    await expect(
      relayPendingMessagingOutboxEvents({
        store,
        queue,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000,
        queueOptions: { attempts: 5, backoffMs: 1000 },
        logger: createLogger("messaging-delivery-relay-test", (record) => logRecords.push(record))
      })
    ).resolves.toBe(1);

    expect(store.claimPending).toHaveBeenCalledWith({
      eventTypes: [
        messagingMessageDeliveryRequestedEventType,
        messagingMessageDeliveryReconciliationRequestedEventType
      ],
      limit: 10,
      now,
      stalePublishingBefore: new Date("2026-07-22T09:59:00.000Z")
    });
    expect(queue.add).toHaveBeenCalledWith(
      messagingDeliveryJobName,
      { outboxEventId: "8e14390f-3db1-4d1c-9344-55679c778427" },
      expect.objectContaining({
        jobId: "messaging-delivery-8e14390f-3db1-4d1c-9344-55679c778427"
      })
    );
    expect(store.markPublished).toHaveBeenCalledWith({
      eventId: "8e14390f-3db1-4d1c-9344-55679c778427",
      claimFence,
      publishedAt: now
    });
    expect(JSON.stringify(logRecords)).not.toContain("messageId");
  });

  it("backs off and leaves the event unpublished when queue add fails", async () => {
    const now = new Date("2026-07-22T10:00:00.000Z");
    const store: OutboxRelayStore = {
      claimPending: vi.fn(async () => [
        {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          eventType: messagingMessageDeliveryRequestedEventType,
          aggregateId: "9e14390f-3db1-4d1c-9344-55679c778427",
          payload: {
            messageId: "9e14390f-3db1-4d1c-9344-55679c778427",
            threadId: "7e14390f-3db1-4d1c-9344-55679c778427",
            channelConnectionId: "6e14390f-3db1-4d1c-9344-55679c778427",
            astrologerUserId: "5e14390f-3db1-4d1c-9344-55679c778427"
          },
          attempts: 2,
          claimFence
        }
      ]),
      markPublished: vi.fn(async () => undefined),
      markPublishFailed: vi.fn(async () => undefined),
      markQuarantined: vi.fn(async () => undefined)
    };
    const queue = {
      add: vi.fn(async () => {
        throw new Error("redis unavailable");
      })
    } as unknown as MessagingDeliveryQueue;

    await relayPendingMessagingOutboxEvents({
      store,
      queue,
      now,
      batchSize: 10,
      publishingLockTimeoutMs: 60_000,
      queueOptions: { attempts: 5, backoffMs: 1000 }
    });

    expect(store.markPublished).not.toHaveBeenCalled();
    expect(store.markPublishFailed).toHaveBeenCalledWith({
      eventId: "8e14390f-3db1-4d1c-9344-55679c778427",
      claimFence,
      failedAt: now,
      nextAvailableAt: new Date("2026-07-22T10:00:04.000Z"),
      errorMessage: "redis unavailable"
    });
  });

  it("propagates a stale publish claim without trying to requeue it", async () => {
    const now = new Date("2026-07-22T10:00:00.000Z");
    const staleClaimError = Object.assign(new Error("Outbox relay claim is stale"), {
      name: "OutboxRelayStaleClaimError",
      code: "OUTBOX_RELAY_STALE_CLAIM" as const
    });
    const store: OutboxRelayStore = {
      claimPending: vi.fn(async () => [
        {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          eventType: messagingMessageDeliveryRequestedEventType,
          aggregateId: "9e14390f-3db1-4d1c-9344-55679c778427",
          payload: {
            messageId: "9e14390f-3db1-4d1c-9344-55679c778427",
            threadId: "7e14390f-3db1-4d1c-9344-55679c778427",
            channelConnectionId: "6e14390f-3db1-4d1c-9344-55679c778427",
            astrologerUserId: "5e14390f-3db1-4d1c-9344-55679c778427"
          },
          attempts: 0,
          claimFence
        }
      ]),
      markPublished: vi.fn(async () => Promise.reject(staleClaimError)),
      markPublishFailed: vi.fn(async () => undefined),
      markQuarantined: vi.fn(async () => undefined)
    };
    const queue = { add: vi.fn(async () => undefined) } as unknown as MessagingDeliveryQueue;

    await expect(
      relayPendingMessagingOutboxEvents({
        store,
        queue,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000,
        queueOptions: { attempts: 5, backoffMs: 1_000 }
      })
    ).rejects.toBe(staleClaimError);
    expect(store.markPublishFailed).not.toHaveBeenCalled();
  });
});
