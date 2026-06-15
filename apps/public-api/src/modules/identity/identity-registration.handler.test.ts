import type {
  AccountRegistrationStore,
  AccountRegistrationUnitOfWork,
  AuthSessionCreationStore,
  AuthSessionCreationUnitOfWork
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import {
  DomainCustomerAccountRegistrationHandler,
  type PasswordHasher,
  type SessionTokenIssuer
} from "./identity-registration.handler";

function createAccountRegistrationUnitOfWork() {
  const store: AccountRegistrationStore = {
    createUser: vi.fn(async (input) => ({
      id: "8e14390f-3db1-4d1c-9344-55679c778427",
      status: input.status,
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z"
    })),
    createAuthIdentity: vi.fn(async (input) => ({
      id: "identity_1",
      userId: input.userId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      email: input.email,
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z"
    })),
    assignRole: vi.fn(async (input) => ({
      id: `role_${input.role}`,
      userId: input.userId,
      role: input.role,
      assignedAt: "2026-06-14T00:00:00.000Z"
    }))
  };
  const accountRegistration: AccountRegistrationUnitOfWork = {
    transact: async (operation) => operation(store)
  };

  return { accountRegistration, store };
}

function createAuthSessionCreationUnitOfWork() {
  const store: AuthSessionCreationStore = {
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
  const authSessionCreation: AuthSessionCreationUnitOfWork = {
    transact: async (operation) => operation(store)
  };

  return { authSessionCreation, store };
}

describe("DomainCustomerAccountRegistrationHandler", () => {
  it("hashes the password, registers the account, creates an initial session and returns an API response with a raw session token", async () => {
    const { accountRegistration, store } = createAccountRegistrationUnitOfWork();
    const { authSessionCreation, store: sessionStore } = createAuthSessionCreationUnitOfWork();
    const passwordHasher: PasswordHasher = {
      hashPassword: vi.fn(async () => "argon2id$hash")
    };
    const sessionTokenIssuer: SessionTokenIssuer = {
      issueSessionToken: vi.fn(() => ({
        token: "raw-session-token",
        tokenHash: "hashed-session-token"
      }))
    };
    const handler = new DomainCustomerAccountRegistrationHandler(
      accountRegistration,
      authSessionCreation,
      passwordHasher,
      sessionTokenIssuer,
      {
        now: () => new Date("2026-06-14T10:00:00.000Z")
      },
      {
        sessionTtlSeconds: 604800
      }
    );

    const response = await handler.registerCustomerAccount({
      email: "client@example.com",
      password: "correct-horse-battery-staple",
      roles: ["client", "astrologer"]
    });

    expect(passwordHasher.hashPassword).toHaveBeenCalledWith("correct-horse-battery-staple");
    expect(store.createAuthIdentity).toHaveBeenCalledWith({
      userId: "8e14390f-3db1-4d1c-9344-55679c778427",
      provider: "email",
      providerSubject: "client@example.com",
      email: "client@example.com",
      passwordHash: "argon2id$hash"
    });
    expect(sessionStore.createSession).toHaveBeenCalledWith({
      userId: "8e14390f-3db1-4d1c-9344-55679c778427",
      tokenHash: "hashed-session-token",
      createdAt: "2026-06-14T10:00:00.000Z",
      expiresAt: "2026-06-21T10:00:00.000Z"
    });
    expect(sessionStore.recordSecurityEvent).toHaveBeenCalledWith({
      userId: "8e14390f-3db1-4d1c-9344-55679c778427",
      sessionId: "session_1",
      eventType: "registration_succeeded",
      occurredAt: "2026-06-14T10:00:00.000Z"
    });
    expect(response).toEqual({
      response: {
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active",
          roles: ["client", "astrologer"]
        }
      },
      session: {
        token: "raw-session-token",
        expiresAt: "2026-06-21T10:00:00.000Z"
      }
    });
  });
});
