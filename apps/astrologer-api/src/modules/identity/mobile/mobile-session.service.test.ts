import { ConfigService } from "@nestjs/config";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  hashPasswordlessCode,
  type MobilePasswordlessLoginStore,
  type MobilePasswordlessLoginUnitOfWork,
  type MobilePasswordlessRegistrationUnitOfWork,
  type MobileSessionManagementStore,
  type MobileSessionStore,
  type MobileSessionUnitOfWork
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";

import { SystemClock } from "../../clock/system-clock.service";
import type { PasswordlessAuthOptions } from "../passwordless/identity-passwordless.handler";
import type { PasswordlessRateLimitPort } from "../passwordless/identity-passwordless.rate-limit";
import {
  MobileAstrologerSessionService,
  MobileAstrologerSessionTokenIssuer,
  MobileRefreshRetryReceiptCodec
} from "./mobile-session.service";

const now = new Date("2026-08-12T10:00:00.000Z");
const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const challengeId = "33333333-3333-4333-8333-333333333333";
const options: PasswordlessAuthOptions = {
  authCodeDeliveryEncryptionKey: Buffer.alloc(32, 1),
  codeSecret: "test-secret",
  codeTtlSeconds: 600,
  resendCooldownSeconds: 60,
  maxAttempts: 5,
  sessionTtlSeconds: 604_800
};

describe("MobileAstrologerSessionService", () => {
  it("encrypts a retry receipt and restores only the original token pair", () => {
    const codec = new MobileRefreshRetryReceiptCodec(options);
    const encrypted = codec.encrypt({
      sessionId,
      refreshTokenId: "33333333-3333-4333-8333-333333333333",
      operationId: "5a14390f-3db1-4d1c-9344-55679c778427",
      accessToken: "access-token-that-must-not-be-stored-in-plaintext",
      accessTokenExpiresAt: "2026-08-12T10:15:00.000Z",
      refreshToken: "refresh-token-that-must-not-be-stored-in-plaintext",
      refreshTokenExpiresAt: "2027-02-08T10:00:00.000Z"
    });

    expect(encrypted).not.toContain("access-token-that-must-not-be-stored-in-plaintext");
    expect(codec.decrypt(encrypted)).toMatchObject({
      sessionId,
      accessToken: "access-token-that-must-not-be-stored-in-plaintext",
      refreshToken: "refresh-token-that-must-not-be-stored-in-plaintext"
    });
  });

  it("uses one mobile-login unit of work for OTP consume, initial family, and security event", async () => {
    const store = createLoginStore();
    let transactionCount = 0;
    const login: MobilePasswordlessLoginUnitOfWork = {
      transact: async (operation) => {
        transactionCount += 1;
        return operation(store);
      }
    };
    const service = createService(login);

    const response = await service.verifyPasswordlessCode(
      {
        challengeId,
        code: "123456",
        platform: "ios",
        deviceLabel: "Anton iPhone"
      },
      { ipAddress: "127.0.0.1", userAgent: "ElevenHouseIOS/1" }
    );

    expect(transactionCount).toBe(1);
    expect(response).toMatchObject({
      account: { id: userId, status: "active", roles: ["astrologer"] },
      sessionId,
      accessTokenExpiresAt: "2026-08-12T10:15:00.000Z",
      refreshTokenExpiresAt: "2027-02-08T10:00:00.000Z"
    });
    expect(store.consumeChallenge).toHaveBeenCalledOnce();
    expect(store.createMobileSession).toHaveBeenCalledOnce();
    expect(store.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "login_succeeded",
        userId,
        metadata: expect.objectContaining({ mobileSessionId: sessionId })
      })
    );
  });
});

function createService(login: MobilePasswordlessLoginUnitOfWork) {
  const sessions: MobileSessionUnitOfWork<MobileSessionStore> = {
    transact: async () => {
      throw new Error("Unexpected non-login mobile session transaction");
    }
  };
  const management: MobileSessionManagementStore = {
    listActiveSessionsForUser: vi.fn(async () => [])
  };
  const registration: MobilePasswordlessRegistrationUnitOfWork = {
    transact: async () => {
      throw new Error("Unexpected mobile registration transaction");
    }
  };
  const issued = ["a".repeat(43), "r".repeat(43)];
  const tokenIssuer = {
    issueToken: vi.fn(() => {
      const token = issued.shift();
      if (!token) throw new Error("Token issuer exhausted");
      return { token, tokenHash: hashSessionToken(token) };
    })
  } as unknown as MobileAstrologerSessionTokenIssuer;
  const clock = { now: vi.fn(() => now) } as unknown as SystemClock;
  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === "astrologerApi.mobileAccessTokenTtlSeconds") return 900;
      if (key === "astrologerApi.mobileSessionIdleTtlSeconds") return 15_552_000;
      throw new Error(`Unexpected config key: ${key}`);
    })
  } as unknown as ConfigService;
  const rateLimiter: PasswordlessRateLimitPort = {
    consumeRequestCode: vi.fn(async () => ({ allowed: true as const })),
    consumeVerifyCode: vi.fn(async () => ({ allowed: true as const })),
    consumeMobileRefresh: vi.fn(async () => ({ allowed: true as const }))
  };

  return new MobileAstrologerSessionService(
    sessions,
    login,
    registration,
    management,
    tokenIssuer,
    new MobileRefreshRetryReceiptCodec(options),
    clock,
    config,
    options,
    rateLimiter
  );
}

function createLoginStore(): MobilePasswordlessLoginStore {
  return {
    findChallengeById: vi.fn(async () => ({
      id: challengeId,
      channel: "email" as const,
      identifier: "astrologer@example.com",
      identifierNormalized: "astrologer@example.com",
      codeHash: hashPasswordlessCode({
        secret: options.codeSecret,
        channel: "email",
        identifierNormalized: "astrologer@example.com",
        code: "123456"
      }),
      requestedRoles: ["astrologer"] as const,
      status: "pending" as const,
      attempts: 0,
      maxAttempts: 5,
      expiresAt: "2026-08-12T10:10:00.000Z",
      resendAvailableAt: "2026-08-12T10:01:00.000Z",
      createdAt: "2026-08-12T09:59:00.000Z",
      updatedAt: "2026-08-12T09:59:00.000Z"
    })),
    incrementChallengeAttempts: vi.fn(async () => undefined),
    consumeChallenge: vi.fn(async () => undefined),
    findAuthIdentityByProviderSubject: vi.fn(async () => ({
      user: {
        id: userId,
        status: "active" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      authIdentity: {
        id: "44444444-4444-4444-8444-444444444444",
        userId,
        provider: "email" as const,
        providerSubject: "astrologer@example.com",
        email: "astrologer@example.com",
        emailVerifiedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      roleAssignments: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          userId,
          role: "astrologer" as const,
          assignedAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    })),
    createMobileSession: vi.fn(async (input) => ({
      id: sessionId,
      userId: input.userId,
      platform: input.platform,
      deviceLabel: input.deviceLabel,
      status: "active" as const,
      accessTokenHash: input.accessTokenHash,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      createdAt: input.createdAt,
      lastUsedAt: input.createdAt,
      expiresAt: input.expiresAt
    })),
    recordSecurityEvent: vi.fn(async (input) => ({
      id: "66666666-6666-4666-8666-666666666666",
      ...input
    }))
  };
}
