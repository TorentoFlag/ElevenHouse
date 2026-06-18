import { describe, expect, it, vi } from "vitest";
import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import { relayPendingOutboxEvents } from "./outbox-relay";
import { authCodeDeliveryJobName, type AuthCodeDeliveryQueue } from "./auth-code-delivery.queue";

describe("relayPendingOutboxEvents", () => {
  it("claims pending and stale publishing outbox events using the configured lock timeout", async () => {
    const now = new Date("2026-06-16T10:00:00.000Z");
    const store: OutboxRelayStore = {
      claimPending: vi.fn(async () => [
        {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          eventType: "identity.auth_code_delivery_requested",
          aggregateId: "9e14390f-3db1-4d1c-9344-55679c778427",
          payload: {
            challengeId: "7e14390f-3db1-4d1c-9344-55679c778427",
            deliveryId: "9e14390f-3db1-4d1c-9344-55679c778427",
            channel: "email" as const,
            identifier: "client@example.com",
            code: "123456",
            expiresAt: "2026-06-16T10:10:00.000Z"
          },
          attempts: 0
        }
      ]),
      markPublished: vi.fn(async () => undefined),
      markPublishFailed: vi.fn(async () => undefined)
    };
    const queue = {
      add: vi.fn(async () => undefined)
    } as unknown as AuthCodeDeliveryQueue;

    await expect(
      relayPendingOutboxEvents({
        store,
        queue,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000,
        queueOptions: {
          attempts: 3,
          backoffMs: 100
        }
      })
    ).resolves.toBe(1);

    expect(store.claimPending).toHaveBeenCalledWith({
      limit: 10,
      now,
      stalePublishingBefore: new Date("2026-06-16T09:59:00.000Z")
    });
    expect(queue.add).toHaveBeenCalledWith(
      authCodeDeliveryJobName,
      { outboxEventId: "8e14390f-3db1-4d1c-9344-55679c778427" },
      expect.objectContaining({
        jobId: "auth-code-delivery-8e14390f-3db1-4d1c-9344-55679c778427"
      })
    );
    expect(store.markPublished).toHaveBeenCalledWith({
      eventId: "8e14390f-3db1-4d1c-9344-55679c778427",
      publishedAt: now
    });
  });
});
