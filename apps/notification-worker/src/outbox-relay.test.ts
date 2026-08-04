import { describe, expect, it, vi } from "vitest";
import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import { createLogger, type LogRecord } from "@elevenhouse/observability";
import { relayPendingOutboxEvents } from "./outbox-relay";
import { authCodeDeliveryJobName, type AuthCodeDeliveryQueue } from "./auth-code-delivery.queue";

const claimFence = 11n;

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
            encryptedCode: {
              algorithm: "aes-256-gcm" as const,
              iv: "test-iv",
              ciphertext: "encrypted:123456",
              authTag: "test-auth-tag"
            },
            expiresAt: "2026-06-16T10:10:00.000Z"
          },
          attempts: 0,
          claimFence
        }
      ]),
      markPublished: vi.fn(async () => undefined),
      markPublishFailed: vi.fn(async () => undefined)
    };
    const queue = {
      add: vi.fn(async () => undefined)
    } as unknown as AuthCodeDeliveryQueue;
    const logRecords: LogRecord[] = [];

    await expect(
      relayPendingOutboxEvents({
        store,
        queue,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000,
        logger: createLogger("notification-worker-test", (record) => logRecords.push(record)),
        queueOptions: {
          attempts: 3,
          backoffMs: 100
        }
      })
    ).resolves.toBe(1);

    expect(store.claimPending).toHaveBeenCalledWith({
      eventTypes: ["identity.auth_code_delivery_requested"],
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
      claimFence,
      publishedAt: now
    });
    expect(logRecords).toEqual([
      expect.objectContaining({
        level: "info",
        message: "notification outbox events claimed",
        meta: { count: 1, batchSize: 10 }
      }),
      expect.objectContaining({
        level: "info",
        message: "notification outbox event publishing",
        meta: {
          outboxEventId: "8e14390f-3db1-4d1c-9344-55679c778427",
          eventType: "identity.auth_code_delivery_requested",
          attempts: 0
        }
      }),
      expect.objectContaining({
        level: "info",
        message: "notification outbox event published",
        meta: {
          outboxEventId: "8e14390f-3db1-4d1c-9344-55679c778427",
          eventType: "identity.auth_code_delivery_requested"
        }
      })
    ]);
  });

  it("logs failed outbox publication without exposing event payload", async () => {
    const now = new Date("2026-06-16T10:00:00.000Z");
    const store: OutboxRelayStore = {
      claimPending: vi.fn(async () => [
        {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          eventType: "identity.unknown",
          aggregateId: "9e14390f-3db1-4d1c-9344-55679c778427",
          payload: {
            challengeId: "7e14390f-3db1-4d1c-9344-55679c778427",
            deliveryId: "9e14390f-3db1-4d1c-9344-55679c778427",
            channel: "email" as const,
            identifier: "client@example.com",
            encryptedCode: {
              algorithm: "aes-256-gcm" as const,
              iv: "test-iv",
              ciphertext: "encrypted:123456",
              authTag: "test-auth-tag"
            },
            expiresAt: "2026-06-16T10:10:00.000Z"
          },
          attempts: 2,
          claimFence
        }
      ]),
      markPublished: vi.fn(async () => undefined),
      markPublishFailed: vi.fn(async () => undefined)
    };
    const queue = {
      add: vi.fn(async () => undefined)
    } as unknown as AuthCodeDeliveryQueue;
    const logRecords: LogRecord[] = [];

    await expect(
      relayPendingOutboxEvents({
        store,
        queue,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000,
        logger: createLogger("notification-worker-test", (record) => logRecords.push(record)),
        queueOptions: {
          attempts: 3,
          backoffMs: 100
        }
      })
    ).resolves.toBe(1);

    expect(queue.add).not.toHaveBeenCalled();
    expect(store.markPublishFailed).toHaveBeenCalledWith({
      eventId: "8e14390f-3db1-4d1c-9344-55679c778427",
      claimFence,
      failedAt: now,
      nextAvailableAt: new Date("2026-06-16T10:00:04.000Z"),
      errorMessage: "Unsupported outbox event type: identity.unknown"
    });
    expect(logRecords.at(-1)).toEqual(
      expect.objectContaining({
        level: "error",
        message: "notification outbox event publish failed",
        meta: {
          outboxEventId: "8e14390f-3db1-4d1c-9344-55679c778427",
          eventType: "identity.unknown",
          attempts: 2,
          errorMessage: "Unsupported outbox event type: identity.unknown"
        }
      })
    );
    expect(JSON.stringify(logRecords)).not.toContain("client@example.com");
    expect(JSON.stringify(logRecords)).not.toContain("encrypted:123456");
  });

  it("propagates a stale publish claim without trying to requeue it", async () => {
    const now = new Date("2026-06-16T10:00:00.000Z");
    const staleClaimError = Object.assign(new Error("Outbox relay claim is stale"), {
      name: "OutboxRelayStaleClaimError",
      code: "OUTBOX_RELAY_STALE_CLAIM" as const
    });
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
            encryptedCode: {
              algorithm: "aes-256-gcm" as const,
              iv: "test-iv",
              ciphertext: "encrypted:123456",
              authTag: "test-auth-tag"
            },
            expiresAt: "2026-06-16T10:10:00.000Z"
          },
          attempts: 0,
          claimFence
        }
      ]),
      markPublished: vi.fn(async () => Promise.reject(staleClaimError)),
      markPublishFailed: vi.fn(async () => undefined)
    };
    const queue = { add: vi.fn(async () => undefined) } as unknown as AuthCodeDeliveryQueue;

    await expect(
      relayPendingOutboxEvents({
        store,
        queue,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000,
        queueOptions: { attempts: 3, backoffMs: 100 }
      })
    ).rejects.toBe(staleClaimError);
    expect(store.markPublishFailed).not.toHaveBeenCalled();
  });
});
