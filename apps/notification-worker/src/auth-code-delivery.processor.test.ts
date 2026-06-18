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
      recordAttempt: vi.fn(async () => undefined),
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
    expect(store.recordAttempt).toHaveBeenCalledWith({
      deliveryId: "delivery_1",
      attemptNumber: 1,
      provider: "system",
      status: "failed",
      errorCode: "AUTH_CODE_EXPIRED",
      errorMessage: "Auth code expired before delivery",
      attemptedAt: now
    });
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
      recordAttempt: vi.fn(async () => undefined),
      markSent: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      redactAuthCodePayload: vi.fn(async () => undefined)
    };
    const delivery = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "email" as const,
        status: "sent" as const,
        providerStatusCode: 202,
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
    expect(store.recordAttempt).toHaveBeenCalledWith({
      deliveryId: "delivery_1",
      attemptNumber: 1,
      provider: "email",
      status: "sent",
      providerStatusCode: 202,
      providerMessageId: "email-message-1",
      attemptedAt: now
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

  it("records retryable failed attempts without marking delivery failed before the final attempt", async () => {
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
      recordAttempt: vi.fn(async () => undefined),
      markSent: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      redactAuthCodePayload: vi.fn(async () => undefined)
    };
    const delivery = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "email" as const,
        status: "failed" as const,
        providerStatusCode: 503,
        errorCode: "EMAIL_DELIVERY_HTTP_503",
        errorMessage: "provider unavailable"
      }))
    };
    const now = new Date("2026-06-16T10:00:00.000Z");

    await expect(
      processAuthCodeDeliveryJob({
        job: createJob({ attemptsMade: 0, opts: { attempts: 3 } }),
        store,
        authCodeCipher: createTestCipher(),
        delivery,
        now
      })
    ).rejects.toThrow("provider unavailable");

    expect(store.recordAttempt).toHaveBeenCalledWith({
      deliveryId: "delivery_1",
      attemptNumber: 1,
      provider: "email",
      status: "failed",
      providerStatusCode: 503,
      errorCode: "EMAIL_DELIVERY_HTTP_503",
      errorMessage: "provider unavailable",
      attemptedAt: now
    });
    expect(store.markFailed).not.toHaveBeenCalled();
    expect(store.redactAuthCodePayload).not.toHaveBeenCalled();
  });

  it("marks delivery failed and redacts the code after the final failed attempt", async () => {
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
      recordAttempt: vi.fn(async () => undefined),
      markSent: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      redactAuthCodePayload: vi.fn(async () => undefined)
    };
    const delivery = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "email" as const,
        status: "failed" as const,
        providerStatusCode: 503,
        errorCode: "EMAIL_DELIVERY_HTTP_503",
        errorMessage: "provider unavailable"
      }))
    };
    const now = new Date("2026-06-16T10:00:00.000Z");

    await processAuthCodeDeliveryJob({
      job: createJob({ attemptsMade: 2, opts: { attempts: 3 } }),
      store,
      authCodeCipher: createTestCipher(),
      delivery,
      now
    });

    expect(store.recordAttempt).toHaveBeenCalledWith({
      deliveryId: "delivery_1",
      attemptNumber: 3,
      provider: "email",
      status: "failed",
      providerStatusCode: 503,
      errorCode: "EMAIL_DELIVERY_HTTP_503",
      errorMessage: "provider unavailable",
      attemptedAt: now
    });
    expect(store.markFailed).toHaveBeenCalledWith({
      deliveryId: "delivery_1",
      provider: "email",
      errorCode: "EMAIL_DELIVERY_HTTP_503",
      errorMessage: "provider unavailable"
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
