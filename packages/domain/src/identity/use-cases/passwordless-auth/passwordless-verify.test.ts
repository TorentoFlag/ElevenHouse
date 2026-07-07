import { describe, expect, it, vi } from "vitest";
import { hashPasswordlessCode } from "./passwordless-code";
import { PasswordlessCodeVerificationError } from "./passwordless-challenge";
import {
  verifyPasswordlessCode,
  verifyPasswordlessCodeForRegistration
} from "./passwordless-verify";

const now = new Date("2026-06-15T10:03:00.000Z");
const sessionCreatedAt = new Date("2026-06-15T10:03:00.000Z");
const sessionExpiresAt = new Date("2026-06-22T10:03:00.000Z");
const codeSecret = "test-secret";

function createPendingChallenge(
  input: {
    readonly code?: string;
    readonly requestedRoles?: readonly ("client" | "astrologer")[];
  } = {}
) {
  const code = input.code ?? "123456";

  return {
    id: "8e14390f-3db1-4d1c-9344-55679c778427",
    channel: "email" as const,
    identifier: "ada@example.com",
    identifierNormalized: "ada@example.com",
    codeHash: hashPasswordlessCode({
      secret: codeSecret,
      channel: "email",
      identifierNormalized: "ada@example.com",
      code
    }),
    requestedRoles: input.requestedRoles ?? (["client"] as const),
    status: "pending" as const,
    attempts: 0,
    maxAttempts: 5,
    expiresAt: "2026-06-15T10:10:00.000Z",
    resendAvailableAt: "2026-06-15T10:04:00.000Z",
    createdAt: "2026-06-15T10:00:00.000Z",
    updatedAt: "2026-06-15T10:00:00.000Z"
  };
}

function createStore(overrides: Record<string, unknown> = {}) {
  return {
    ...createBaseStore(),
    ...overrides
  } as ReturnType<typeof createBaseStore>;
}

function createBaseStore() {
  return {
    findChallengeById: vi.fn(async () => createPendingChallenge()),
    incrementChallengeAttempts: vi.fn(async () => undefined),
    consumeChallenge: vi.fn(async () => undefined),
    findAuthIdentityByProviderSubject: vi.fn(async () => null),
    createSession: vi.fn(async (input) => ({
      id: "session_1",
      status: "active" as const,
      ...input
    })),
    recordSecurityEvent: vi.fn(async (input) => ({
      id: "event_1",
      ...input
    }))
  };
}

function verifyWithStore(store: ReturnType<typeof createBaseStore>, code = "123456") {
  return verifyPasswordlessCode({
    store,
    challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
    code,
    codeSecret,
    now,
    session: {
      tokenHash: " session_hash ",
      createdAt: sessionCreatedAt,
      expiresAt: sessionExpiresAt
    }
  });
}

describe("verifyPasswordlessCode", () => {
  it("verifies and consumes a registration challenge without requiring an existing identity", async () => {
    const store = createStore();

    const result = await verifyPasswordlessCodeForRegistration({
      store,
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456",
      codeSecret,
      now
    });

    expect(result).toEqual({
      channel: "email",
      identifierNormalized: "ada@example.com",
      requestedRoles: ["client"]
    });
    expect(store.findAuthIdentityByProviderSubject).not.toHaveBeenCalled();
    expect(store.consumeChallenge).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      consumedAt: "2026-06-15T10:03:00.000Z"
    });
    expect(store.createSession).not.toHaveBeenCalled();
  });

  it("rejects registration role mismatches without consuming the challenge", async () => {
    const store = createStore();

    await expect(
      verifyPasswordlessCodeForRegistration({
        store,
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        codeSecret,
        now,
        roles: ["astrologer"]
      })
    ).rejects.toBeInstanceOf(PasswordlessCodeVerificationError);

    expect(store.consumeChallenge).not.toHaveBeenCalled();
    expect(store.createSession).not.toHaveBeenCalled();
  });

  it("accepts registration roles that match the challenge roles in a different order", async () => {
    const store = createStore({
      findChallengeById: vi.fn(async () =>
        createPendingChallenge({ requestedRoles: ["client", "astrologer"] })
      )
    });

    await expect(
      verifyPasswordlessCodeForRegistration({
        store,
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        codeSecret,
        now,
        roles: ["astrologer", "client"]
      })
    ).resolves.toMatchObject({
      requestedRoles: ["client", "astrologer"]
    });

    expect(store.consumeChallenge).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      consumedAt: "2026-06-15T10:03:00.000Z"
    });
  });

  it("rejects a valid code for an unknown identity without creating an account", async () => {
    const store = createStore();

    await expect(verifyWithStore(store)).rejects.toBeInstanceOf(PasswordlessCodeVerificationError);

    expect(store.consumeChallenge).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      consumedAt: "2026-06-15T10:03:00.000Z"
    });
    expect(store.createSession).not.toHaveBeenCalled();
  });

  it("logs in an existing identity without granting already assigned requested roles", async () => {
    const store = createStore({
      findAuthIdentityByProviderSubject: vi.fn(async () => ({
        user: {
          id: "user_existing",
          status: "active" as const,
          createdAt: "2026-06-14T10:03:00.000Z",
          updatedAt: "2026-06-14T10:03:00.000Z"
        },
        authIdentity: {
          id: "identity_existing",
          userId: "user_existing",
          provider: "email" as const,
          providerSubject: "ada@example.com",
          email: "ada@example.com",
          emailVerifiedAt: "2026-06-14T10:03:00.000Z",
          createdAt: "2026-06-14T10:03:00.000Z",
          updatedAt: "2026-06-14T10:03:00.000Z"
        },
        roleAssignments: [
          {
            id: "role_client",
            userId: "user_existing",
            role: "client" as const,
            assignedAt: "2026-06-14T10:03:00.000Z"
          }
        ]
      }))
    });

    const result = await verifyWithStore(store);

    expect(store.createSession).toHaveBeenCalledWith({
      userId: "user_existing",
      tokenHash: "session_hash",
      createdAt: "2026-06-15T10:03:00.000Z",
      expiresAt: "2026-06-22T10:03:00.000Z"
    });
    expect(store.recordSecurityEvent).toHaveBeenCalledWith({
      eventType: "login_succeeded",
      occurredAt: "2026-06-15T10:03:00.000Z",
      userId: "user_existing",
      sessionId: "session_1"
    });
    expect(result.authenticationKind).toBe("login");
    expect(result.roleAssignments).toHaveLength(1);
  });

  it("rejects login when an existing identity is missing a requested role", async () => {
    const store = createStore({
      findChallengeById: vi.fn(async () =>
        createPendingChallenge({ requestedRoles: ["astrologer"] })
      ),
      findAuthIdentityByProviderSubject: vi.fn(async () => ({
        user: {
          id: "user_existing",
          status: "active" as const,
          createdAt: "2026-06-14T10:03:00.000Z",
          updatedAt: "2026-06-14T10:03:00.000Z"
        },
        authIdentity: {
          id: "identity_existing",
          userId: "user_existing",
          provider: "email" as const,
          providerSubject: "ada@example.com",
          email: "ada@example.com",
          emailVerifiedAt: "2026-06-14T10:03:00.000Z",
          createdAt: "2026-06-14T10:03:00.000Z",
          updatedAt: "2026-06-14T10:03:00.000Z"
        },
        roleAssignments: [
          {
            id: "role_client",
            userId: "user_existing",
            role: "client" as const,
            assignedAt: "2026-06-14T10:03:00.000Z"
          }
        ]
      }))
    });

    await expect(verifyWithStore(store)).rejects.toBeInstanceOf(PasswordlessCodeVerificationError);

    expect(store.createSession).not.toHaveBeenCalled();
  });

  it("does not duplicate roles already assigned to an existing identity", async () => {
    const store = createStore({
      findChallengeById: vi.fn(async () =>
        createPendingChallenge({ requestedRoles: ["astrologer"] })
      ),
      findAuthIdentityByProviderSubject: vi.fn(async () => ({
        user: {
          id: "user_existing",
          status: "active" as const,
          createdAt: "2026-06-14T10:03:00.000Z",
          updatedAt: "2026-06-14T10:03:00.000Z"
        },
        authIdentity: {
          id: "identity_existing",
          userId: "user_existing",
          provider: "email" as const,
          providerSubject: "ada@example.com",
          email: "ada@example.com",
          emailVerifiedAt: "2026-06-14T10:03:00.000Z",
          createdAt: "2026-06-14T10:03:00.000Z",
          updatedAt: "2026-06-14T10:03:00.000Z"
        },
        roleAssignments: [
          {
            id: "role_client",
            userId: "user_existing",
            role: "client" as const,
            assignedAt: "2026-06-14T10:03:00.000Z"
          },
          {
            id: "role_astrologer",
            userId: "user_existing",
            role: "astrologer" as const,
            assignedAt: "2026-06-14T10:04:00.000Z"
          }
        ]
      }))
    });

    const result = await verifyWithStore(store);

    expect(result.roleAssignments.map((assignment) => assignment.role)).toEqual([
      "client",
      "astrologer"
    ]);
  });

  it("increments attempts and fails generically for a wrong code", async () => {
    const store = createStore();

    await expect(verifyWithStore(store, "000000")).rejects.toBeInstanceOf(
      PasswordlessCodeVerificationError
    );

    expect(store.incrementChallengeAttempts).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      attemptedAt: "2026-06-15T10:03:00.000Z"
    });
    expect(store.recordSecurityEvent).toHaveBeenCalledWith({
      eventType: "login_failed",
      occurredAt: "2026-06-15T10:03:00.000Z",
      metadata: {
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        channel: "email"
      }
    });
    expect(store.consumeChallenge).not.toHaveBeenCalled();
    expect(store.createSession).not.toHaveBeenCalled();
  });

  it("fails generically when the challenge does not exist", async () => {
    const store = createStore({
      findChallengeById: vi.fn(async () => null)
    });

    await expect(verifyWithStore(store)).rejects.toBeInstanceOf(PasswordlessCodeVerificationError);

    expect(store.incrementChallengeAttempts).not.toHaveBeenCalled();
    expect(store.consumeChallenge).not.toHaveBeenCalled();
  });

  it("fails generically for an expired challenge", async () => {
    const store = createStore({
      findChallengeById: vi.fn(async () => ({
        ...createPendingChallenge(),
        expiresAt: "2026-06-15T10:02:59.999Z"
      }))
    });

    await expect(verifyWithStore(store)).rejects.toBeInstanceOf(PasswordlessCodeVerificationError);

    expect(store.incrementChallengeAttempts).not.toHaveBeenCalled();
    expect(store.consumeChallenge).not.toHaveBeenCalled();
  });

  it("fails generically when max attempts are exhausted", async () => {
    const store = createStore({
      findChallengeById: vi.fn(async () => ({
        ...createPendingChallenge(),
        attempts: 5,
        maxAttempts: 5
      }))
    });

    await expect(verifyWithStore(store)).rejects.toBeInstanceOf(PasswordlessCodeVerificationError);

    expect(store.incrementChallengeAttempts).not.toHaveBeenCalled();
    expect(store.consumeChallenge).not.toHaveBeenCalled();
  });

  it("fails generically for a consumed challenge", async () => {
    const store = createStore({
      findChallengeById: vi.fn(async () => ({
        ...createPendingChallenge(),
        status: "consumed" as const,
        consumedAt: "2026-06-15T10:02:00.000Z"
      }))
    });

    await expect(verifyWithStore(store)).rejects.toBeInstanceOf(PasswordlessCodeVerificationError);

    expect(store.incrementChallengeAttempts).not.toHaveBeenCalled();
    expect(store.consumeChallenge).not.toHaveBeenCalled();
  });

  it("logs in an existing verified phone identity", async () => {
    const phoneChallenge = {
      ...createPendingChallenge(),
      channel: "phone" as const,
      identifier: "+15551234090",
      identifierNormalized: "+15551234090",
      codeHash: hashPasswordlessCode({
        secret: codeSecret,
        channel: "phone",
        identifierNormalized: "+15551234090",
        code: "123456"
      })
    };
    const store = createStore({
      findChallengeById: vi.fn(async () => phoneChallenge),
      findAuthIdentityByProviderSubject: vi.fn(async () => ({
        user: {
          id: "user_existing",
          status: "active" as const,
          createdAt: "2026-06-14T10:03:00.000Z",
          updatedAt: "2026-06-14T10:03:00.000Z"
        },
        authIdentity: {
          id: "identity_existing",
          userId: "user_existing",
          provider: "phone" as const,
          providerSubject: "+15551234090",
          phoneNumber: "+15551234090",
          phoneVerifiedAt: "2026-06-14T10:03:00.000Z",
          createdAt: "2026-06-14T10:03:00.000Z",
          updatedAt: "2026-06-14T10:03:00.000Z"
        },
        roleAssignments: [
          {
            id: "role_client",
            userId: "user_existing",
            role: "client" as const,
            assignedAt: "2026-06-14T10:03:00.000Z"
          }
        ]
      }))
    });

    const result = await verifyWithStore(store);

    expect(result.authIdentity).toMatchObject({
      provider: "phone",
      phoneNumber: "+15551234090",
      phoneVerifiedAt: "2026-06-14T10:03:00.000Z"
    });
  });
});
