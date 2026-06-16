import { describe, expect, it, vi } from "vitest";
import { hashPasswordlessCode } from "./passwordless-code";
import { PasswordlessCodeVerificationError } from "./passwordless-challenge";
import { verifyPasswordlessCode } from "./passwordless-verify";

const now = new Date("2026-06-15T10:03:00.000Z");
const sessionCreatedAt = new Date("2026-06-15T10:03:00.000Z");
const sessionExpiresAt = new Date("2026-06-22T10:03:00.000Z");
const codeSecret = "test-secret";

function createPendingChallenge(code = "123456") {
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
    requestedRoles: ["client"] as const,
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
    createUser: vi.fn(async (input) => ({
      id: "user_1",
      status: input.status,
      createdAt: "2026-06-15T10:03:00.000Z",
      updatedAt: "2026-06-15T10:03:00.000Z"
    })),
    createAuthIdentity: vi.fn(async (input) => ({
      id: "identity_1",
      userId: input.userId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.emailVerifiedAt === undefined ? {} : { emailVerifiedAt: input.emailVerifiedAt }),
      createdAt: "2026-06-15T10:03:00.000Z",
      updatedAt: "2026-06-15T10:03:00.000Z"
    })),
    assignRole: vi.fn(async (input) => ({
      id: `role_${input.role}`,
      userId: input.userId,
      role: input.role,
      assignedAt: "2026-06-15T10:03:00.000Z"
    })),
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
  it("creates a verified identity, account, roles and session for a new user", async () => {
    const store = createStore();

    const result = await verifyWithStore(store);

    expect(store.consumeChallenge).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      consumedAt: "2026-06-15T10:03:00.000Z"
    });
    expect(store.createUser).toHaveBeenCalledWith({ status: "active" });
    expect(store.createAuthIdentity).toHaveBeenCalledWith({
      userId: "user_1",
      provider: "email",
      providerSubject: "ada@example.com",
      email: "ada@example.com",
      emailVerifiedAt: "2026-06-15T10:03:00.000Z"
    });
    expect(store.assignRole).toHaveBeenCalledWith({
      userId: "user_1",
      role: "client"
    });
    expect(store.createSession).toHaveBeenCalledWith({
      userId: "user_1",
      tokenHash: "session_hash",
      createdAt: "2026-06-15T10:03:00.000Z",
      expiresAt: "2026-06-22T10:03:00.000Z"
    });
    expect(store.recordSecurityEvent).toHaveBeenCalledWith({
      eventType: "registration_succeeded",
      occurredAt: "2026-06-15T10:03:00.000Z",
      userId: "user_1",
      sessionId: "session_1"
    });
    expect(result.authenticationKind).toBe("registration");
    expect(result.user.id).toBe("user_1");
  });

  it("logs in an existing identity without granting new roles", async () => {
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

    expect(store.createUser).not.toHaveBeenCalled();
    expect(store.createAuthIdentity).not.toHaveBeenCalled();
    expect(store.assignRole).not.toHaveBeenCalled();
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

    await expect(verifyWithStore(store)).rejects.toBeInstanceOf(
      PasswordlessCodeVerificationError
    );

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

    await expect(verifyWithStore(store)).rejects.toBeInstanceOf(
      PasswordlessCodeVerificationError
    );

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

    await expect(verifyWithStore(store)).rejects.toBeInstanceOf(
      PasswordlessCodeVerificationError
    );

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

    await expect(verifyWithStore(store)).rejects.toBeInstanceOf(
      PasswordlessCodeVerificationError
    );

    expect(store.incrementChallengeAttempts).not.toHaveBeenCalled();
    expect(store.consumeChallenge).not.toHaveBeenCalled();
  });

  it("creates a verified phone identity for a new phone challenge", async () => {
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
      createAuthIdentity: vi.fn(async (input) => ({
        id: "identity_1",
        userId: input.userId,
        provider: input.provider,
        providerSubject: input.providerSubject,
        ...(input.phoneNumber === undefined ? {} : { phoneNumber: input.phoneNumber }),
        ...(input.phoneVerifiedAt === undefined ? {} : { phoneVerifiedAt: input.phoneVerifiedAt }),
        createdAt: "2026-06-15T10:03:00.000Z",
        updatedAt: "2026-06-15T10:03:00.000Z"
      }))
    });

    const result = await verifyWithStore(store);

    expect(store.createAuthIdentity).toHaveBeenCalledWith({
      userId: "user_1",
      provider: "phone",
      providerSubject: "+15551234090",
      phoneNumber: "+15551234090",
      phoneVerifiedAt: "2026-06-15T10:03:00.000Z"
    });
    expect(result.authIdentity).toMatchObject({
      provider: "phone",
      phoneNumber: "+15551234090",
      phoneVerifiedAt: "2026-06-15T10:03:00.000Z"
    });
  });
});
