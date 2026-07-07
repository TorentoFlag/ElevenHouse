import { describe, expect, it, vi } from "vitest";
import {
  CustomerAccountIdentityConflictError,
  registerCustomerAccountWithSession,
  verifyPasswordlessCodeAndRegisterCustomerAccountWithSession,
  type CustomerAccountRegistrationSessionStore,
  type CustomerAccountRegistrationSessionUnitOfWork,
  type PasswordlessCustomerAccountRegistrationSessionStore,
  type PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "./index";
import { hashPasswordlessCode } from "../passwordless-auth";

function createStore(): CustomerAccountRegistrationSessionStore {
  return {
    createUser: vi.fn(async (input) => ({
      id: "user_1",
      status: input.status,
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z"
    })),
    createUserProfile: vi.fn(async (input) => ({
      userId: input.userId,
      displayName: input.displayName,
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z"
    })),
    createAuthIdentity: vi.fn(async (input) => ({
      id: "identity_1",
      userId: input.userId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.phoneNumber === undefined ? {} : { phoneNumber: input.phoneNumber }),
      ...(input.emailVerifiedAt === undefined ? {} : { emailVerifiedAt: input.emailVerifiedAt }),
      ...(input.phoneVerifiedAt === undefined ? {} : { phoneVerifiedAt: input.phoneVerifiedAt }),
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z"
    })),
    assignRole: vi.fn(async (input) => ({
      id: `role_${input.role}`,
      userId: input.userId,
      role: input.role,
      ...(input.assignedByUserId === undefined ? {} : { assignedByUserId: input.assignedByUserId }),
      assignedAt: "2026-06-15T00:00:00.000Z"
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

describe("registerCustomerAccountWithSession", () => {
  it("creates the account, initial session and security event in one unit of work", async () => {
    const store = createStore();
    let transactCalls = 0;
    const registration: CustomerAccountRegistrationSessionUnitOfWork = {
      transact: async (operation) => {
        transactCalls += 1;
        return operation(store);
      }
    };
    const createdAt = new Date("2026-06-15T10:00:00.000Z");
    const expiresAt = new Date("2026-06-22T10:00:00.000Z");

    const result = await registerCustomerAccountWithSession({
      registration,
      identity: {
        provider: "email",
        providerSubject: " ada@example.com ",
        email: " ada@example.com ",
        emailVerifiedAt: new Date("2026-06-15T10:00:00.000Z")
      },
      displayName: " Анна ",
      roles: ["client", "client", "astrologer"],
      session: {
        tokenHash: " session_hash ",
        createdAt,
        expiresAt,
        ipAddress: " 127.0.0.1 ",
        userAgent: " Mozilla/5.0 "
      },
      securityEventType: "registration_succeeded"
    });

    expect(transactCalls).toBe(1);
    expect(store.createUser).toHaveBeenCalledWith({ status: "active" });
    expect(store.createUserProfile).toHaveBeenCalledWith({
      userId: "user_1",
      displayName: "Анна"
    });
    expect(store.createAuthIdentity).toHaveBeenCalledWith({
      userId: "user_1",
      provider: "email",
      providerSubject: "ada@example.com",
      email: "ada@example.com",
      emailVerifiedAt: "2026-06-15T10:00:00.000Z"
    });
    expect(store.assignRole).toHaveBeenCalledTimes(2);
    expect(store.createSession).toHaveBeenCalledWith({
      userId: "user_1",
      tokenHash: "session_hash",
      createdAt: "2026-06-15T10:00:00.000Z",
      expiresAt: "2026-06-22T10:00:00.000Z",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0"
    });
    expect(store.recordSecurityEvent).toHaveBeenCalledWith({
      userId: "user_1",
      sessionId: "session_1",
      eventType: "registration_succeeded",
      occurredAt: "2026-06-15T10:00:00.000Z",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0"
    });
    expect(result).toEqual({
      user: {
        id: "user_1",
        status: "active",
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:00.000Z"
      },
      authIdentity: {
        id: "identity_1",
        userId: "user_1",
        provider: "email",
        providerSubject: "ada@example.com",
        email: "ada@example.com",
        emailVerifiedAt: "2026-06-15T10:00:00.000Z",
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:00.000Z"
      },
      userProfile: {
        userId: "user_1",
        displayName: "Анна",
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:00.000Z"
      },
      roleAssignments: [
        {
          id: "role_client",
          userId: "user_1",
          role: "client",
          assignedAt: "2026-06-15T00:00:00.000Z"
        },
        {
          id: "role_astrologer",
          userId: "user_1",
          role: "astrologer",
          assignedAt: "2026-06-15T00:00:00.000Z"
        }
      ],
      session: {
        id: "session_1",
        userId: "user_1",
        tokenHash: "session_hash",
        status: "active",
        createdAt: "2026-06-15T10:00:00.000Z",
        expiresAt: "2026-06-22T10:00:00.000Z",
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0"
      },
      securityEvent: {
        id: "event_1",
        userId: "user_1",
        sessionId: "session_1",
        eventType: "registration_succeeded",
        occurredAt: "2026-06-15T10:00:00.000Z",
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0"
      }
    });
  });
});

describe("verifyPasswordlessCodeAndRegisterCustomerAccountWithSession", () => {
  it("rolls back challenge consumption when account creation fails in the same unit of work", async () => {
    const codeSecret = "test-secret";
    const now = new Date("2026-06-15T10:00:00.000Z");
    const challenge = {
      id: "challenge_1",
      channel: "email" as const,
      identifier: "client@example.com",
      identifierNormalized: "client@example.com",
      codeHash: hashPasswordlessCode({
        secret: codeSecret,
        channel: "email",
        identifierNormalized: "client@example.com",
        code: "123456"
      }),
      status: "pending" as const,
      attempts: 0,
      maxAttempts: 5,
      requestedRoles: ["client" as const],
      createdAt: "2026-06-15T09:59:00.000Z",
      updatedAt: "2026-06-15T09:59:00.000Z",
      expiresAt: "2026-06-15T10:10:00.000Z",
      resendAvailableAt: "2026-06-15T10:00:00.000Z"
    };
    const store: PasswordlessCustomerAccountRegistrationSessionStore = {
      ...createStore(),
      createAuthIdentity: vi.fn(async () => {
        throw new CustomerAccountIdentityConflictError();
      }),
      findChallengeById: vi.fn(async () => challenge),
      incrementChallengeAttempts: vi.fn(async () => undefined),
      consumeChallenge: vi.fn(async (input) => {
        Object.assign(challenge, {
          status: "consumed",
          consumedAt: input.consumedAt
        });
      }),
      findAuthIdentityByProviderSubject: vi.fn(async () => null)
    };
    const registration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork = {
      transact: async (operation) => {
        const snapshot = { ...challenge };

        try {
          return await operation(store);
        } catch (error) {
          Object.assign(challenge, snapshot);
          throw error;
        }
      }
    };

    await expect(
      verifyPasswordlessCodeAndRegisterCustomerAccountWithSession({
        registration,
        challengeId: "challenge_1",
        code: "123456",
        codeSecret,
        now,
        displayName: "Анна",
        roles: ["client"],
        session: {
          tokenHash: "session_hash",
          expiresAt: new Date("2026-06-22T10:00:00.000Z")
        },
        securityEventType: "registration_succeeded"
      })
    ).rejects.toBeInstanceOf(CustomerAccountIdentityConflictError);

    expect(store.consumeChallenge).toHaveBeenCalledWith({
      challengeId: "challenge_1",
      consumedAt: "2026-06-15T10:00:00.000Z"
    });
    expect(challenge.status).toBe("pending");
  });
});
