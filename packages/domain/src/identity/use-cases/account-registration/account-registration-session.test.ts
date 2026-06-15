import { describe, expect, it, vi } from "vitest";
import {
  registerCustomerAccountWithSession,
  type CustomerAccountRegistrationSessionStore,
  type CustomerAccountRegistrationSessionUnitOfWork
} from "./index";

function createStore(): CustomerAccountRegistrationSessionStore {
  return {
    createUser: vi.fn(async (input) => ({
      id: "user_1",
      status: input.status,
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
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z"
    })),
    assignRole: vi.fn(async (input) => ({
      id: `role_${input.role}`,
      userId: input.userId,
      role: input.role,
      ...(input.assignedByUserId === undefined
        ? {}
        : { assignedByUserId: input.assignedByUserId }),
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
        passwordHash: "argon2$hash"
      },
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
    expect(store.createAuthIdentity).toHaveBeenCalledWith({
      userId: "user_1",
      provider: "email",
      providerSubject: "ada@example.com",
      email: "ada@example.com",
      passwordHash: "argon2$hash"
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
