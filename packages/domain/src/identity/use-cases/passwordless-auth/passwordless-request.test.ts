import { describe, expect, it, vi } from "vitest";
import { requestPasswordlessCode } from "./passwordless-request";

describe("requestPasswordlessCode", () => {
  it("creates a challenge, delivers the code and records delivery metadata", async () => {
    const store = {
      createChallenge: vi.fn(async (input) => ({
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        ...input,
        status: "pending" as const,
        attempts: 0,
        createdAt: "2026-06-15T10:00:00.000Z",
        updatedAt: "2026-06-15T10:00:00.000Z"
      })),
      recordDelivery: vi.fn(async (input) => ({ id: "delivery_1", ...input })),
      cancelChallenge: vi.fn()
    };
    const delivery = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "dev",
        status: "sent" as const,
        providerMessageId: "dev-message-1"
      }))
    };

    const result = await requestPasswordlessCode({
      store,
      delivery,
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
    expect(delivery.deliverAuthCode).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email",
      identifier: "ada@example.com",
      code: "123456",
      expiresAt: "2026-06-15T10:10:00.000Z"
    });
    expect(store.recordDelivery).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email",
      provider: "dev",
      status: "sent",
      providerMessageId: "dev-message-1",
      sentAt: "2026-06-15T10:00:00.000Z"
    });
    expect(result).toEqual({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email",
      maskedIdentifier: "a***@example.com",
      expiresAt: "2026-06-15T10:10:00.000Z",
      resendAvailableAt: "2026-06-15T10:01:00.000Z"
    });
  });

  it("cancels the challenge when delivery fails", async () => {
    const store = {
      createChallenge: vi.fn(async (input) => ({
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        ...input,
        status: "pending" as const,
        attempts: 0,
        createdAt: "2026-06-15T10:00:00.000Z",
        updatedAt: "2026-06-15T10:00:00.000Z"
      })),
      recordDelivery: vi.fn(async (input) => ({ id: "delivery_1", ...input })),
      cancelChallenge: vi.fn(async () => undefined)
    };
    const delivery = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "dev",
        status: "failed" as const,
        errorCode: "DEV_DISABLED",
        errorMessage: "Dev delivery disabled"
      }))
    };

    await expect(
      requestPasswordlessCode({
        store,
        delivery,
        channel: "email",
        identifier: "ada@example.com",
        roles: ["client"],
        code: "123456",
        codeSecret: "test-secret",
        now: new Date("2026-06-15T10:00:00.000Z"),
        ttlSeconds: 600,
        resendCooldownSeconds: 60,
        maxAttempts: 5
      })
    ).rejects.toThrow("Passwordless code delivery is unavailable");

    expect(store.cancelChallenge).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      cancelledAt: "2026-06-15T10:00:00.000Z"
    });
  });
});
