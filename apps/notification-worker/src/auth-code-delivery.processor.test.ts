import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import type { AuthCodeDeliveryProcessingStore } from "@elevenhouse/db/notifications";
import { processAuthCodeDeliveryJob } from "./auth-code-delivery.processor";
import type { AuthCodeDeliveryJobData } from "./auth-code-delivery.queue";

function createJob(overrides: Partial<Job<AuthCodeDeliveryJobData>> = {}): Job<AuthCodeDeliveryJobData> {
  return {
    data: { outboxEventId: "outbox_1" },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides
  } as Job<AuthCodeDeliveryJobData>;
}

describe("processAuthCodeDeliveryJob", () => {
  it("marks expired queued deliveries failed without calling the provider and redacts the code", async () => {
    const store: AuthCodeDeliveryProcessingStore = {
      findByOutboxEventId: vi.fn(async () => ({
        outboxEventId: "outbox_1",
        challengeId: "challenge_1",
        deliveryId: "delivery_1",
        channel: "email" as const,
        identifier: "client@example.com",
        encryptedCode: createEncryptedCode(),
        expiresAt: "2026-06-16T09:59:00.000Z",
        deliveryStatus: "queued" as const
      })),
      markSent: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      redactAuthCodePayload: vi.fn(async () => undefined)
    };
    const delivery = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "email" as const,
        status: "sent" as const
      }))
    };
    const now = new Date("2026-06-16T10:00:00.000Z");

    const authCodeCipher = createTestCipher();

    await processAuthCodeDeliveryJob({
      job: createJob(),
      store,
      authCodeCipher,
      delivery,
      now
    });

    expect(delivery.deliverAuthCode).not.toHaveBeenCalled();
    expect(authCodeCipher.decrypt).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith({
      deliveryId: "delivery_1",
      provider: "system",
      errorCode: "AUTH_CODE_EXPIRED",
      errorMessage: "Auth code expired before delivery"
    });
    expect(store.redactAuthCodePayload).toHaveBeenCalledWith({
      outboxEventId: "outbox_1",
      redactedAt: now
    });
  });

  it("sends queued deliveries with a stable idempotency context and redacts after success", async () => {
    const store: AuthCodeDeliveryProcessingStore = {
      findByOutboxEventId: vi.fn(async () => ({
        outboxEventId: "outbox_1",
        challengeId: "challenge_1",
        deliveryId: "delivery_1",
        channel: "email" as const,
        identifier: "client@example.com",
        encryptedCode: createEncryptedCode(),
        expiresAt: "2026-06-16T10:10:00.000Z",
        deliveryStatus: "queued" as const
      })),
      markSent: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      redactAuthCodePayload: vi.fn(async () => undefined)
    };
    const delivery = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "email" as const,
        status: "sent" as const,
        providerMessageId: "email-message-1"
      }))
    };
    const now = new Date("2026-06-16T10:00:00.000Z");

    const authCodeCipher = createTestCipher();

    await processAuthCodeDeliveryJob({
      job: createJob(),
      store,
      authCodeCipher,
      delivery,
      now
    });

    expect(authCodeCipher.decrypt).toHaveBeenCalledWith({
      encrypted: createEncryptedCode(),
      aad: [
        "identity.auth_code_delivery_requested",
        "challenge_1",
        "delivery_1",
        "email",
        "client@example.com",
        "2026-06-16T10:10:00.000Z"
      ].join("|")
    });
    expect(delivery.deliverAuthCode).toHaveBeenCalledWith({
      challengeId: "challenge_1",
      deliveryId: "delivery_1",
      outboxEventId: "outbox_1",
      channel: "email",
      identifier: "client@example.com",
      code: "123456",
      expiresAt: "2026-06-16T10:10:00.000Z"
    });
    expect(store.markSent).toHaveBeenCalledWith({
      deliveryId: "delivery_1",
      provider: "email",
      providerMessageId: "email-message-1",
      sentAt: now
    });
    expect(store.redactAuthCodePayload).toHaveBeenCalledWith({
      outboxEventId: "outbox_1",
      redactedAt: now
    });
  });
});

function createEncryptedCode() {
  return {
    algorithm: "aes-256-gcm" as const,
    iv: "test-iv",
    ciphertext: "encrypted:123456",
    authTag: "test-auth-tag"
  };
}

function createTestCipher() {
  return {
    encrypt: vi.fn(() => createEncryptedCode()),
    decrypt: vi.fn(() => "123456")
  };
}
