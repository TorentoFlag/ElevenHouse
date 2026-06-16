import type {
  AuthChallenge,
  AuthCodeDeliveryPort,
  PasswordlessAuthStore,
  PasswordlessAuthUnitOfWork
} from "@elevenhouse/domain";
import { hashPasswordlessCode } from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import {
  DomainPasswordlessAuthHandler,
  type PasswordlessAuthOptions,
  type PasswordlessCodeGenerator,
  type SessionTokenIssuer
} from "./identity-passwordless.handler";

const now = new Date("2026-06-16T10:00:00.000Z");
const codeSecret = "test-secret";

function createPasswordlessAuthUnitOfWork(store: PasswordlessAuthStore): PasswordlessAuthUnitOfWork {
  return {
    transact: async (operation) => operation(store)
  };
}

function createBaseStore(): PasswordlessAuthStore {
  return {
    findPendingChallengeByIdentifier: vi.fn(async () => null),
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
    cancelChallenge: vi.fn(async () => undefined),
    findChallengeById: vi.fn(async () => null),
    incrementChallengeAttempts: vi.fn(async () => undefined),
    consumeChallenge: vi.fn(async () => undefined),
    findAuthIdentityByProviderSubject: vi.fn(async () => null),
    createUser: vi.fn(async (input) => ({
      id: "8e14390f-3db1-4d1c-9344-55679c778427",
      status: input.status,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
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
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })),
    assignRole: vi.fn(async (input) => ({
      id: `role_${input.role}`,
      userId: input.userId,
      role: input.role,
      assignedAt: now.toISOString()
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

function createPendingChallenge(code: string): AuthChallenge {
  return {
    id: "8e14390f-3db1-4d1c-9344-55679c778427",
    channel: "email",
    identifier: "client@example.com",
    identifierNormalized: "client@example.com",
    codeHash: hashPasswordlessCode({
      secret: codeSecret,
      channel: "email",
      identifierNormalized: "client@example.com",
      code
    }),
    requestedRoles: ["client"],
    status: "pending",
    attempts: 0,
    maxAttempts: 5,
    expiresAt: "2026-06-16T10:10:00.000Z",
    resendAvailableAt: "2026-06-16T10:01:00.000Z",
    createdAt: "2026-06-16T10:00:00.000Z",
    updatedAt: "2026-06-16T10:00:00.000Z"
  };
}

function createHandler(input: {
  readonly store: PasswordlessAuthStore;
  readonly delivery?: AuthCodeDeliveryPort;
  readonly codeGenerator?: PasswordlessCodeGenerator;
  readonly options?: Partial<PasswordlessAuthOptions>;
}): DomainPasswordlessAuthHandler {
  const sessionTokenIssuer: SessionTokenIssuer = {
    issueSessionToken: vi.fn(() => ({
      token: "raw-session-token",
      tokenHash: "hashed-session-token"
    }))
  };
  const delivery: AuthCodeDeliveryPort = input.delivery ?? {
    deliverAuthCode: vi.fn(async () => ({
      provider: "dev",
      status: "sent" as const,
      providerMessageId: "dev-message-1"
    }))
  };
  const codeGenerator: PasswordlessCodeGenerator = input.codeGenerator ?? {
    generateCode: vi.fn(() => "123456")
  };

  return new DomainPasswordlessAuthHandler(
    createPasswordlessAuthUnitOfWork(input.store),
    delivery,
    codeGenerator,
    sessionTokenIssuer,
    {
      now: () => now
    },
    {
      codeSecret,
      codeTtlSeconds: 600,
      resendCooldownSeconds: 60,
      maxAttempts: 5,
      sessionTtlSeconds: 604800,
      ...input.options
    }
  );
}

describe("DomainPasswordlessAuthHandler", () => {
  it("creates and delivers a passwordless code challenge through the domain use case", async () => {
    const store = createBaseStore();
    const delivery: AuthCodeDeliveryPort = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "dev",
        status: "sent" as const,
        providerMessageId: "dev-message-1"
      }))
    };
    const handler = createHandler({ store, delivery });

    const response = await handler.requestCode({
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    });

    expect(store.createChallenge).toHaveBeenCalledWith({
      channel: "email",
      identifier: "client@example.com",
      identifierNormalized: "client@example.com",
      codeHash: expect.any(String),
      requestedRoles: ["client"],
      maxAttempts: 5,
      expiresAt: "2026-06-16T10:10:00.000Z",
      resendAvailableAt: "2026-06-16T10:01:00.000Z"
    });
    expect(delivery.deliverAuthCode).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email",
      identifier: "client@example.com",
      code: "123456",
      expiresAt: "2026-06-16T10:10:00.000Z"
    });
    expect(response).toEqual({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email",
      maskedIdentifier: "c***@example.com",
      expiresAt: "2026-06-16T10:10:00.000Z",
      resendAvailableAt: "2026-06-16T10:01:00.000Z"
    });
  });

  it("verifies a passwordless code, creates a session and returns the raw session token", async () => {
    const store = {
      ...createBaseStore(),
      findChallengeById: vi.fn(async () => createPendingChallenge("123456"))
    } satisfies PasswordlessAuthStore;
    const handler = createHandler({ store });

    const response = await handler.verifyCode({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456"
    });

    expect(store.consumeChallenge).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      consumedAt: "2026-06-16T10:00:00.000Z"
    });
    expect(store.createSession).toHaveBeenCalledWith({
      userId: "8e14390f-3db1-4d1c-9344-55679c778427",
      tokenHash: "hashed-session-token",
      createdAt: "2026-06-16T10:00:00.000Z",
      expiresAt: "2026-06-23T10:00:00.000Z"
    });
    expect(response).toEqual({
      response: {
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active",
          roles: ["client"]
        }
      },
      session: {
        token: "raw-session-token",
        expiresAt: "2026-06-23T10:00:00.000Z"
      }
    });
  });
});
