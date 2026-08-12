import { describe, expect, it, vi } from "vitest";
import { hashPasswordlessCode } from "../identity";
import {
  createMobileSession,
  refreshMobileSession,
  revokeAllMobileSessions,
  revokeMobileSession,
  verifyMobilePasswordlessLogin,
  verifyMobilePasswordlessRegistration,
  type MobileRefreshToken,
  type MobileSession,
  type MobilePasswordlessLoginStore,
  type MobilePasswordlessRegistrationStore,
  type MobileSessionRefreshStore
} from "./mobile-session";

const now = new Date("2026-08-11T10:00:00.000Z");

function activeSession(): MobileSession {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    platform: "ios",
    deviceLabel: "Anton iPhone",
    status: "active",
    accessTokenHash: "old-access",
    accessTokenExpiresAt: "2026-08-11T10:15:00.000Z",
    createdAt: "2026-08-11T09:00:00.000Z",
    lastUsedAt: "2026-08-11T09:00:00.000Z",
    expiresAt: "2027-02-07T10:00:00.000Z"
  };
}

function activeRefreshToken(status: MobileRefreshToken["status"] = "active"): MobileRefreshToken {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    sessionId: activeSession().id,
    tokenHash: "old-refresh",
    status,
    createdAt: "2026-08-11T09:00:00.000Z",
    expiresAt: "2027-02-07T10:00:00.000Z",
    ...(status === "consumed" ? { consumedAt: now.toISOString() } : {})
  };
}

describe("mobile session lifecycle", () => {
  it("creates an opaque access and refresh token pair with independent hashes", async () => {
    const persistMobileSession = vi.fn(async () => activeSession());
    const result = await createMobileSession({
      sessions: {
        transact: async (operation) => operation({ createMobileSession: persistMobileSession })
      },
      tokenIssuer: {
        issueToken: vi
          .fn()
          .mockReturnValueOnce({ token: "access-token", tokenHash: "access-hash" })
          .mockReturnValueOnce({ token: "refresh-token", tokenHash: "refresh-hash" })
      },
      userId: activeSession().userId,
      platform: "ios",
      deviceLabel: " Anton iPhone ",
      now,
      accessTokenTtlSeconds: 900,
      idleTtlSeconds: 15_552_000
    });

    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
    expect(persistMobileSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessTokenHash: "access-hash",
        refreshTokenHash: "refresh-hash",
        deviceLabel: "Anton iPhone"
      })
    );
  });

  it("rotates an active refresh token and extends the idle expiry", async () => {
    const store: MobileSessionRefreshStore = {
      lockRefreshFamilyByTokenHash: vi.fn(async () => ({
        refreshToken: activeRefreshToken(),
        session: activeSession()
      })),
      consumeRefreshToken: vi.fn(async () => true),
      rotateSession: vi.fn(async () => true),
      revokeSession: vi.fn(async () => undefined),
      ...refreshReceiptStore()
    };
    const result = await refreshMobileSession({
      sessions: { transact: async (operation) => operation(store) },
      tokenIssuer: {
        issueToken: vi
          .fn()
          .mockReturnValueOnce({ token: "access-2", tokenHash: "access-hash-2" })
          .mockReturnValueOnce({ token: "refresh-2", tokenHash: "refresh-hash-2" })
      },
      refreshTokenHash: "old-refresh",
      operationId: "5a14390f-3db1-4d1c-9344-55679c778427",
      retryReceiptCipher: receiptCipher(),
      now,
      accessTokenTtlSeconds: 900,
      idleTtlSeconds: 15_552_000
    });

    expect(result).toMatchObject({
      kind: "refreshed",
      accessToken: "access-2",
      refreshToken: "refresh-2"
    });
    expect(store.consumeRefreshToken).toHaveBeenCalledOnce();
    expect(store.purgeExpiredArtifacts).toHaveBeenCalledWith({ now: now.toISOString() });
    expect(store.rotateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessTokenHash: "access-hash-2",
        refreshTokenHash: "refresh-hash-2"
      })
    );
  });

  it("revokes the device session family when a consumed refresh token is replayed", async () => {
    const store: MobileSessionRefreshStore = {
      lockRefreshFamilyByTokenHash: vi.fn(async () => ({
        refreshToken: activeRefreshToken("consumed"),
        session: activeSession()
      })),
      consumeRefreshToken: vi.fn(async () => true),
      rotateSession: vi.fn(async () => true),
      revokeSession: vi.fn(async () => undefined),
      ...refreshReceiptStore()
    };
    const result = await refreshMobileSession({
      sessions: { transact: async (operation) => operation(store) },
      tokenIssuer: { issueToken: vi.fn() },
      refreshTokenHash: "old-refresh",
      operationId: "5a14390f-3db1-4d1c-9344-55679c778427",
      retryReceiptCipher: receiptCipher(),
      now,
      accessTokenTtlSeconds: 900,
      idleTtlSeconds: 15_552_000
    });

    expect(result).toEqual({ kind: "reused" });
    expect(store.revokeSession).toHaveBeenCalledWith(
      expect.objectContaining({ revokedReason: "refresh_token_reuse_detected" })
    );
  });

  it("returns the short retry receipt without revoking when the same refresh operation is retried", async () => {
    const store: MobileSessionRefreshStore = {
      lockRefreshFamilyByTokenHash: vi.fn(async () => ({
        refreshToken: activeRefreshToken("consumed"),
        session: activeSession()
      })),
      consumeRefreshToken: vi.fn(async () => true),
      rotateSession: vi.fn(async () => true),
      revokeSession: vi.fn(async () => undefined),
      ...refreshReceiptStore()
    };
    vi.mocked(store.findRefreshRetryReceipt).mockResolvedValue({
      encryptedTokenPair: "encrypted-original-token-pair"
    });

    await expect(
      refreshMobileSession({
        sessions: { transact: async (operation) => operation(store) },
        tokenIssuer: { issueToken: vi.fn() },
        refreshTokenHash: "old-refresh",
        operationId: "5a14390f-3db1-4d1c-9344-55679c778427",
        retryReceiptCipher: receiptCipher(),
        now,
        accessTokenTtlSeconds: 900,
        idleTtlSeconds: 15_552_000
      })
    ).resolves.toEqual({ kind: "recovered", encryptedTokenPair: "encrypted-original-token-pair" });
    expect(store.revokeSession).not.toHaveBeenCalled();
  });

  it("records logout, logout-all, and remote device revocation without retaining token secrets", async () => {
    const recordSecurityEvent = vi.fn(async (input) => ({
      id: "77777777-7777-4777-8777-777777777777",
      ...input
    }));
    const store = {
      revokeSession: vi.fn(async () => undefined),
      revokeAllSessionsForUser: vi.fn(async () => undefined),
      recordSecurityEvent
    };
    const sessions = { transact: async <T>(operation: (value: typeof store) => Promise<T>) => operation(store) };

    await revokeMobileSession({
      sessions,
      sessionId: activeSession().id,
      userId: activeSession().userId,
      now,
      reason: "logout"
    });
    await revokeMobileSession({
      sessions,
      sessionId: "99999999-9999-4999-8999-999999999999",
      userId: activeSession().userId,
      now,
      reason: "remote_device_revoke"
    });
    await revokeAllMobileSessions({
      sessions,
      userId: activeSession().userId,
      now,
      reason: "logout_all"
    });

    expect(recordSecurityEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ eventType: "logout_succeeded", metadata: expect.objectContaining({ reason: "logout" }) })
    );
    expect(recordSecurityEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ eventType: "session_revoked", metadata: expect.objectContaining({ reason: "remote_device_revoke" }) })
    );
    expect(recordSecurityEvent).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ eventType: "logout_succeeded", metadata: expect.objectContaining({ reason: "logout_all" }) })
    );
    expect(JSON.stringify(recordSecurityEvent.mock.calls)).not.toContain("old-refresh");
  });

  it("rejects invalid TTLs before issuing or persisting tokens", async () => {
    const issueToken = vi.fn();
    const transact = vi.fn();

    await expect(
      createMobileSession({
        sessions: { transact },
        tokenIssuer: { issueToken },
        userId: activeSession().userId,
        platform: "ios",
        deviceLabel: "Anton iPhone",
        now,
        accessTokenTtlSeconds: 0,
        idleTtlSeconds: 15_552_000
      })
    ).rejects.toThrow("Mobile access token TTL must be a positive integer");

    expect(issueToken).not.toHaveBeenCalled();
    expect(transact).not.toHaveBeenCalled();
  });

  it("rejects a refresh whose access lifetime cannot fit inside the idle family", async () => {
    const issueToken = vi.fn();
    const transact = vi.fn();

    await expect(
      refreshMobileSession({
        sessions: { transact },
        tokenIssuer: { issueToken },
      refreshTokenHash: "old-refresh",
      operationId: "5a14390f-3db1-4d1c-9344-55679c778427",
      retryReceiptCipher: receiptCipher(),
        now,
        accessTokenTtlSeconds: 901,
        idleTtlSeconds: 900
      })
    ).rejects.toThrow("Mobile session idle TTL cannot be shorter than access token TTL");

    expect(issueToken).not.toHaveBeenCalled();
    expect(transact).not.toHaveBeenCalled();
  });

  it("verifies OTP, creates the initial token family, and records its security event in one unit of work", async () => {
    const store = createMobileLoginStore();
    let transactionCount = 0;
    const login = {
      transact: async <T>(operation: (value: MobilePasswordlessLoginStore) => Promise<T>) => {
        transactionCount += 1;
        return operation(store);
      }
    };

    const result = await verifyMobilePasswordlessLogin({
      login,
      tokenIssuer: {
        issueToken: vi
          .fn()
          .mockReturnValueOnce({ token: "access-token", tokenHash: "access-hash" })
          .mockReturnValueOnce({ token: "refresh-token", tokenHash: "refresh-hash" })
      },
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456",
      codeSecret: "test-secret",
      platform: "ios",
      deviceLabel: "Anton iPhone",
      now,
      accessTokenTtlSeconds: 900,
      idleTtlSeconds: 15_552_000,
      ipAddress: "127.0.0.1",
      userAgent: "ElevenHouseIOS/1"
    });

    expect(transactionCount).toBe(1);
    expect(store.consumeChallenge).toHaveBeenCalledOnce();
    expect(store.createMobileSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: activeSession().userId,
        accessTokenHash: "access-hash",
        refreshTokenHash: "refresh-hash"
      })
    );
    expect(store.recordSecurityEvent).toHaveBeenCalledWith({
      eventType: "login_succeeded",
      occurredAt: now.toISOString(),
      userId: activeSession().userId,
      ipAddress: "127.0.0.1",
      userAgent: "ElevenHouseIOS/1",
      metadata: {
        authenticationKind: "mobile",
        mobileSessionId: activeSession().id,
        platform: "ios"
      }
    });
    expect(result).toMatchObject({
      account: { id: activeSession().userId, status: "active", roles: ["astrologer"] },
      accessToken: "access-token",
      refreshToken: "refresh-token"
    });
  });

  it("registers an astrologer and creates the native session family in the same OTP transaction", async () => {
    const store = createMobileRegistrationStore();
    const result = await verifyMobilePasswordlessRegistration({
      registration: { transact: async (operation) => operation(store) },
      tokenIssuer: {
        issueToken: vi
          .fn()
          .mockReturnValueOnce({ token: "access-registration", tokenHash: "access-registration-hash" })
          .mockReturnValueOnce({ token: "refresh-registration", tokenHash: "refresh-registration-hash" })
      },
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456",
      codeSecret: "test-secret",
      displayName: "Анна",
      platform: "ios",
      deviceLabel: "Anna iPhone",
      now,
      accessTokenTtlSeconds: 900,
      idleTtlSeconds: 15_552_000
    });

    expect(store.consumeChallenge).toHaveBeenCalledOnce();
    expect(store.createUser).toHaveBeenCalledWith({ status: "active" });
    expect(store.assignRole).toHaveBeenCalledWith({
      userId: activeSession().userId,
      role: "astrologer"
    });
    expect(store.createMobileSession).toHaveBeenCalledOnce();
    expect(store.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "registration_succeeded", userId: activeSession().userId })
    );
    expect(result.account).toEqual({
      id: activeSession().userId,
      status: "active",
      roles: ["astrologer"]
    });
  });
});

function refreshReceiptStore() {
  return {
    purgeExpiredArtifacts: vi.fn(async () => undefined),
    findRefreshRetryReceipt: vi.fn(async () => null),
    createRefreshRetryReceipt: vi.fn(async () => undefined),
    recordSecurityEvent: vi.fn(async (input) => ({
      id: "77777777-7777-4777-8777-777777777777",
      ...input
    }))
  };
}

function receiptCipher() {
  return { encrypt: vi.fn(() => "encrypted-token-pair") };
}

function createMobileLoginStore(): MobilePasswordlessLoginStore {
  return {
    findChallengeById: vi.fn(async () => ({
      id: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email" as const,
      identifier: "astrologer@example.com",
      identifierNormalized: "astrologer@example.com",
      codeHash: hashPasswordlessCode({
        secret: "test-secret",
        channel: "email",
        identifierNormalized: "astrologer@example.com",
        code: "123456"
      }),
      requestedRoles: ["astrologer"] as const,
      status: "pending" as const,
      attempts: 0,
      maxAttempts: 5,
      expiresAt: "2026-08-11T10:10:00.000Z",
      resendAvailableAt: "2026-08-11T10:01:00.000Z",
      createdAt: "2026-08-11T09:59:00.000Z",
      updatedAt: "2026-08-11T09:59:00.000Z"
    })),
    incrementChallengeAttempts: vi.fn(async () => undefined),
    consumeChallenge: vi.fn(async () => undefined),
    findAuthIdentityByProviderSubject: vi.fn(async () => ({
      user: {
        id: activeSession().userId,
        status: "active" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      authIdentity: {
        id: "44444444-4444-4444-8444-444444444444",
        userId: activeSession().userId,
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
          userId: activeSession().userId,
          role: "astrologer" as const,
          assignedAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    })),
    createMobileSession: vi.fn(async () => activeSession()),
    recordSecurityEvent: vi.fn(async (input) => ({
      id: "66666666-6666-4666-8666-666666666666",
      ...input
    }))
  };
}

function createMobileRegistrationStore(): MobilePasswordlessRegistrationStore {
  return {
    ...createMobileLoginStore(),
    createSession: vi.fn(async () => ({
      id: "88888888-8888-4888-8888-888888888888",
      userId: activeSession().userId,
      tokenHash: "unused",
      status: "active" as const,
      createdAt: now.toISOString(),
      expiresAt: "2026-08-12T11:00:00.000Z"
    })),
    createUser: vi.fn(async () => ({
      id: activeSession().userId,
      status: "active" as const,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })),
    createUserProfile: vi.fn(async ({ userId, displayName }) => ({
      userId,
      displayName,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })),
    createAuthIdentity: vi.fn(async (input) => ({
      id: "99999999-9999-4999-8999-999999999999",
      ...input,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })),
    assignRole: vi.fn(async ({ userId, role }) => ({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      userId,
      role,
      assignedAt: now.toISOString()
    }))
  };
}
