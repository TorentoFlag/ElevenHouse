import type { PasswordlessAuthStore, PasswordlessAuthUnitOfWork } from "@elevenhouse/domain";
import { hashPasswordlessCode } from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import {
  AesGcmAuthCodeEncryption,
  DomainPasswordlessAuthHandler,
  type PasswordlessAuthOptions
} from "./identity-passwordless.handler";
import { OpsSessionTokenIssuer, SystemClock } from "./identity-session.service";

const now = new Date("2026-06-16T10:00:00.000Z");
const options: PasswordlessAuthOptions = {
  authCodeDeliveryEncryptionKey: Buffer.alloc(32, 1),
  codeSecret: "test-secret",
  codeTtlSeconds: 600,
  resendCooldownSeconds: 60,
  maxAttempts: 5,
  sessionTtlSeconds: 604800
};

describe("DomainPasswordlessAuthHandler", () => {
  it("requests passwordless codes with the astrologer role fixed server-side", async () => {
    const store = createStore();
    const handler = createHandler(store);

    await expect(
      handler.requestCode({
        channel: "email",
        identifier: "astrologer@example.com"
      })
    ).resolves.toMatchObject({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email"
    });

    expect(store.createChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedRoles: ["astrologer"]
      })
    );
  });

  it("verifies a code and returns an astrologer account session", async () => {
    const store = createStore();
    const handler = createHandler(store);

    await expect(
      handler.verifyCode({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456"
      })
    ).resolves.toEqual({
      response: {
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active",
          roles: ["astrologer"]
        }
      },
      session: {
        token: "raw-session-token",
        expiresAt: "2026-06-23T10:00:00.000Z"
      }
    });
  });
});

function createHandler(store: PasswordlessAuthStore): DomainPasswordlessAuthHandler {
  const auth: PasswordlessAuthUnitOfWork = {
    transact: async (operation) => operation(store)
  };
  const sessionIssuer = {
    issueSessionToken: vi.fn(() => ({
      token: "raw-session-token",
      tokenHash: "session_hash"
    }))
  } as unknown as OpsSessionTokenIssuer;
  const clock = {
    now: vi.fn(() => now)
  } as unknown as SystemClock;

  return new DomainPasswordlessAuthHandler(
    auth,
    new AesGcmAuthCodeEncryption(options),
    { generateCode: vi.fn(() => "123456") },
    sessionIssuer,
    clock,
    options
  );
}

function createStore(): PasswordlessAuthStore {
  return {
    findPendingChallengeByIdentifier: vi.fn(async () => null),
    findLatestDeliveryByChallengeId: vi.fn(async () => null),
    createChallenge: vi.fn(async (input) => ({
      id: "8e14390f-3db1-4d1c-9344-55679c778427",
      ...input,
      status: "pending",
      attempts: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })),
    recordDelivery: vi.fn(async (input) => ({
      id: "delivery_1",
      createdAt: now.toISOString(),
      ...input
    })),
    recordAuthCodeDeliveryRequested: vi.fn(async () => undefined),
    cancelChallenge: vi.fn(async () => undefined),
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
      expiresAt: "2026-06-16T10:10:00.000Z",
      resendAvailableAt: "2026-06-16T10:01:00.000Z",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })),
    incrementChallengeAttempts: vi.fn(async () => undefined),
    consumeChallenge: vi.fn(async () => undefined),
    findAuthIdentityByProviderSubject: vi.fn(async () => ({
      user: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active" as const,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      },
      authIdentity: {
        id: "identity_1",
        userId: "8e14390f-3db1-4d1c-9344-55679c778427",
        provider: "email" as const,
        providerSubject: "astrologer@example.com",
        email: "astrologer@example.com",
        emailVerifiedAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      },
      roleAssignments: [
        {
          id: "role_astrologer",
          userId: "8e14390f-3db1-4d1c-9344-55679c778427",
          role: "astrologer" as const,
          assignedAt: now.toISOString()
        }
      ]
    })),
    createSession: vi.fn(async (input) => ({
      id: "session_1",
      status: "active",
      ...input
    })),
    recordSecurityEvent: vi.fn(async (input) => ({
      id: "event_1",
      ...input
    }))
  };
}
