import { describe, expect, it, vi } from "vitest";
import { requestPasswordlessCode } from "./passwordless-request";
import { PasswordlessCodeRequestCooldownError } from "./passwordless-challenge";

describe("requestPasswordlessCode", () => {
  it("creates a challenge and queues delivery without calling the delivery provider", async () => {
    const encryption = createTestEncryption();
    const store = {
      findPendingChallengeByIdentifier: vi.fn(async () => null),
      findLatestDeliveryByChallengeId: vi.fn(async () => null),
      createChallenge: vi.fn(async (input) => ({
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        ...input,
        status: "pending" as const,
        attempts: 0,
        createdAt: "2026-06-15T10:00:00.000Z",
        updatedAt: "2026-06-15T10:00:00.000Z"
      })),
      recordDelivery: vi.fn(async (input) => ({ id: "delivery_1", ...input })),
      recordAuthCodeDeliveryRequested: vi.fn(async () => undefined),
      cancelChallenge: vi.fn()
    };

    const result = await requestPasswordlessCode({
      store,
      encryption,
      channel: "email",
      identifier: " ADA@example.COM ",
      roles: ["client"],
      code: "123456",
      codeSecret: "test-secret",
      now: new Date("2026-06-15T10:00:00.000Z"),
      ttlSeconds: 600,
      resendCooldownSeconds: 60,
      maxAttempts: 5,
      ipAddress: " 127.0.0.1 ",
      userAgent: " Mozilla/5.0 "
    });

    expect(store.createChallenge).toHaveBeenCalledWith({
      channel: "email",
      identifier: "ADA@example.COM",
      identifierNormalized: "ada@example.com",
      codeHash: expect.any(String),
      requestedRoles: ["client"],
      maxAttempts: 5,
      expiresAt: "2026-06-15T10:10:00.000Z",
      resendAvailableAt: "2026-06-15T10:01:00.000Z",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0"
    });
    expect(store.recordDelivery).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      status: "queued"
    });
    expect(store.recordAuthCodeDeliveryRequested).toHaveBeenCalledWith({
      payload: {
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        deliveryId: "delivery_1",
        channel: "email",
        identifier: "ada@example.com",
        encryptedCode: {
          algorithm: "aes-256-gcm",
          iv: "test-iv",
          ciphertext: "encrypted:123456",
          authTag: "test-auth-tag"
        },
        expiresAt: "2026-06-15T10:10:00.000Z"
      },
      occurredAt: "2026-06-15T10:00:00.000Z"
    });
    expect(result).toEqual({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email",
      maskedIdentifier: "a***@example.com",
      expiresAt: "2026-06-15T10:10:00.000Z",
      resendAvailableAt: "2026-06-15T10:01:00.000Z"
    });
  });

  it("normalizes and masks phone identifiers", async () => {
    const encryption = createTestEncryption();
    const store = {
      findPendingChallengeByIdentifier: vi.fn(async () => null),
      findLatestDeliveryByChallengeId: vi.fn(async () => null),
      createChallenge: vi.fn(async (input) => ({
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        ...input,
        status: "pending" as const,
        attempts: 0,
        createdAt: "2026-06-15T10:00:00.000Z",
        updatedAt: "2026-06-15T10:00:00.000Z"
      })),
      recordDelivery: vi.fn(async (input) => ({ id: "delivery_1", ...input })),
      recordAuthCodeDeliveryRequested: vi.fn(async () => undefined),
      cancelChallenge: vi.fn()
    };

    const result = await requestPasswordlessCode({
      store,
      encryption,
      channel: "phone",
      identifier: "+1 (555) 123-4090",
      roles: ["client"],
      code: "123456",
      codeSecret: "test-secret",
      now: new Date("2026-06-15T10:00:00.000Z"),
      ttlSeconds: 600,
      resendCooldownSeconds: 60,
      maxAttempts: 5
    });

    expect(store.createChallenge).toHaveBeenCalledWith({
      channel: "phone",
      identifier: "+1 (555) 123-4090",
      identifierNormalized: "+15551234090",
      codeHash: expect.any(String),
      requestedRoles: ["client"],
      maxAttempts: 5,
      expiresAt: "2026-06-15T10:10:00.000Z",
      resendAvailableAt: "2026-06-15T10:01:00.000Z"
    });
    expect(result.maskedIdentifier).toBe("+15***90");
  });

  it("rejects a duplicate request while an existing pending challenge is in resend cooldown", async () => {
    const encryption = createTestEncryption();
    const store = {
      findPendingChallengeByIdentifier: vi.fn(async () => ({
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        channel: "email" as const,
        identifier: "client@example.com",
        identifierNormalized: "client@example.com",
        codeHash: "hash",
        requestedRoles: ["client"] as const,
        status: "pending" as const,
        attempts: 0,
        maxAttempts: 5,
        expiresAt: "2026-06-15T10:10:00.000Z",
        resendAvailableAt: "2026-06-15T10:01:00.000Z",
        createdAt: "2026-06-15T10:00:00.000Z",
        updatedAt: "2026-06-15T10:00:00.000Z"
      })),
      findLatestDeliveryByChallengeId: vi.fn(async () => ({
        id: "delivery_1",
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "queued" as const,
        createdAt: "2026-06-15T10:00:00.000Z"
      })),
      createChallenge: vi.fn(),
      recordDelivery: vi.fn(),
      recordAuthCodeDeliveryRequested: vi.fn(),
      cancelChallenge: vi.fn()
    };

    await expect(
      requestPasswordlessCode({
        store,
        encryption,
        channel: "email",
        identifier: "CLIENT@example.com",
        roles: ["client"],
        code: "123456",
        codeSecret: "test-secret",
        now: new Date("2026-06-15T10:00:30.000Z"),
        ttlSeconds: 600,
        resendCooldownSeconds: 60,
        maxAttempts: 5
      })
    ).rejects.toBeInstanceOf(PasswordlessCodeRequestCooldownError);

    expect(store.findPendingChallengeByIdentifier).toHaveBeenCalledWith({
      channel: "email",
      identifierNormalized: "client@example.com"
    });
    expect(store.findLatestDeliveryByChallengeId).toHaveBeenCalledWith(
      "8e14390f-3db1-4d1c-9344-55679c778427"
    );
    expect(store.createChallenge).not.toHaveBeenCalled();
    expect(store.recordAuthCodeDeliveryRequested).not.toHaveBeenCalled();
    expect(store.cancelChallenge).not.toHaveBeenCalled();
  });

  it("cancels an existing pending challenge when cooldown has elapsed before creating a new one", async () => {
    const encryption = createTestEncryption();
    const store = {
      findPendingChallengeByIdentifier: vi.fn(async () => ({
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        channel: "email" as const,
        identifier: "client@example.com",
        identifierNormalized: "client@example.com",
        codeHash: "hash",
        requestedRoles: ["client"] as const,
        status: "pending" as const,
        attempts: 0,
        maxAttempts: 5,
        expiresAt: "2026-06-15T10:10:00.000Z",
        resendAvailableAt: "2026-06-15T10:01:00.000Z",
        createdAt: "2026-06-15T10:00:00.000Z",
        updatedAt: "2026-06-15T10:00:00.000Z"
      })),
      findLatestDeliveryByChallengeId: vi.fn(async () => ({
        id: "delivery_1",
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "sent" as const,
        createdAt: "2026-06-15T10:00:00.000Z",
        sentAt: "2026-06-15T10:00:02.000Z"
      })),
      createChallenge: vi.fn(async (input) => ({
        id: "9e14390f-3db1-4d1c-9344-55679c778427",
        ...input,
        status: "pending" as const,
        attempts: 0,
        createdAt: "2026-06-15T10:01:30.000Z",
        updatedAt: "2026-06-15T10:01:30.000Z"
      })),
      recordDelivery: vi.fn(async (input) => ({ id: "delivery_2", ...input })),
      recordAuthCodeDeliveryRequested: vi.fn(async () => undefined),
      cancelChallenge: vi.fn(async () => undefined)
    };

    await requestPasswordlessCode({
      store,
      encryption,
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"],
      code: "654321",
      codeSecret: "test-secret",
      now: new Date("2026-06-15T10:01:30.000Z"),
      ttlSeconds: 600,
      resendCooldownSeconds: 60,
      maxAttempts: 5
    });

    expect(store.cancelChallenge).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      cancelledAt: "2026-06-15T10:01:30.000Z"
    });
    expect(store.findLatestDeliveryByChallengeId).not.toHaveBeenCalled();
    expect(store.createChallenge).toHaveBeenCalled();
    expect(store.recordAuthCodeDeliveryRequested).toHaveBeenCalledWith({
      payload: {
        challengeId: "9e14390f-3db1-4d1c-9344-55679c778427",
        deliveryId: "delivery_2",
        channel: "email",
        identifier: "client@example.com",
        encryptedCode: {
          algorithm: "aes-256-gcm",
          iv: "test-iv",
          ciphertext: "encrypted:654321",
          authTag: "test-auth-tag"
        },
        expiresAt: "2026-06-15T10:11:30.000Z"
      },
      occurredAt: "2026-06-15T10:01:30.000Z"
    });
  });

  it("replaces an existing pending challenge immediately when the latest delivery failed", async () => {
    const encryption = createTestEncryption();
    const store = {
      findPendingChallengeByIdentifier: vi.fn(async () => ({
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        channel: "email" as const,
        identifier: "client@example.com",
        identifierNormalized: "client@example.com",
        codeHash: "hash",
        requestedRoles: ["client"] as const,
        status: "pending" as const,
        attempts: 0,
        maxAttempts: 5,
        expiresAt: "2026-06-15T10:10:00.000Z",
        resendAvailableAt: "2026-06-15T10:01:00.000Z",
        createdAt: "2026-06-15T10:00:00.000Z",
        updatedAt: "2026-06-15T10:00:00.000Z"
      })),
      findLatestDeliveryByChallengeId: vi.fn(async () => ({
        id: "delivery_1",
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "failed" as const,
        errorCode: "provider_unavailable",
        createdAt: "2026-06-15T10:00:00.000Z"
      })),
      createChallenge: vi.fn(async (input) => ({
        id: "9e14390f-3db1-4d1c-9344-55679c778427",
        ...input,
        status: "pending" as const,
        attempts: 0,
        createdAt: "2026-06-15T10:00:30.000Z",
        updatedAt: "2026-06-15T10:00:30.000Z"
      })),
      recordDelivery: vi.fn(async (input) => ({ id: "delivery_2", ...input })),
      recordAuthCodeDeliveryRequested: vi.fn(async () => undefined),
      cancelChallenge: vi.fn(async () => undefined)
    };

    await requestPasswordlessCode({
      store,
      encryption,
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"],
      code: "654321",
      codeSecret: "test-secret",
      now: new Date("2026-06-15T10:00:30.000Z"),
      ttlSeconds: 600,
      resendCooldownSeconds: 60,
      maxAttempts: 5
    });

    expect(store.findLatestDeliveryByChallengeId).toHaveBeenCalledWith(
      "8e14390f-3db1-4d1c-9344-55679c778427"
    );
    expect(store.cancelChallenge).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      cancelledAt: "2026-06-15T10:00:30.000Z"
    });
    expect(store.createChallenge).toHaveBeenCalled();
    expect(store.recordDelivery).toHaveBeenCalledWith({
      challengeId: "9e14390f-3db1-4d1c-9344-55679c778427",
      status: "queued"
    });
  });
});

function createTestEncryption() {
  return {
    encryptAuthCode: vi.fn((input: { readonly code: string }) => ({
      algorithm: "aes-256-gcm" as const,
      iv: "test-iv",
      ciphertext: `encrypted:${input.code}`,
      authTag: "test-auth-tag"
    }))
  };
}
