import type {
  ClientJoinIntentClaimStore,
  PasswordlessCustomerAccountRegistrationSessionStore,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { hashPasswordlessCode } from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import type { SessionTokenIssuer } from "../passwordless/identity-passwordless.handler";
import { DomainRegistrationHandler } from "./identity-registration.handler";

const now = new Date("2026-06-16T10:00:00.000Z");
const codeSecret = "test-secret";

describe("DomainRegistrationHandler", () => {
  it("claims a client join intent inside the registration transaction", async () => {
    const store = createRegistrationStore();
    const handler = new DomainRegistrationHandler(
      createUnitOfWork(store),
      createSessionTokenIssuer(),
      { now: () => now },
      { codeSecret, sessionTtlSeconds: 604800 }
    );

    await handler.verifyCodeAndRegister({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456",
      displayName: "Марина",
      roles: ["client"],
      clientJoinIntentToken: "join_1234567890abcdef"
    });

    expect(store.findJoinIntentByTokenHash).toHaveBeenCalledWith({
      tokenHash: "sha256:e33b027e982588fdc45c1182c93d740ab110e2bee6d20a71f6279b400ddd425d"
    });
    expect(store.ensureRelationship).toHaveBeenCalledWith({
      clientUserId: "11111111-1111-4111-8111-111111111111",
      astrologerUserId: "22222222-2222-4222-8222-222222222222",
      source: "direct_link",
      now: "2026-06-16T10:00:00.000Z"
    });
  });
});

function createUnitOfWork(
  store: PasswordlessCustomerAccountRegistrationSessionStore &
    ClientJoinIntentClaimStore
): PasswordlessCustomerAccountRegistrationSessionUnitOfWork<
  typeof store
> {
  return {
    transact: async (operation) => operation(store)
  };
}

function createSessionTokenIssuer(): SessionTokenIssuer {
  return {
    issueSessionToken: vi.fn(() => ({
      token: "raw-session-token",
      tokenHash: "hashed-session-token"
    }))
  };
}

function createRegistrationStore() {
  return {
    findChallengeById: vi.fn(async () => ({
      id: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email" as const,
      identifier: "client@example.com",
      identifierNormalized: "client@example.com",
      codeHash: hashPasswordlessCode({
        secret: codeSecret,
        channel: "email",
        identifierNormalized: "client@example.com",
        code: "123456"
      }),
      requestedRoles: ["client" as const],
      status: "pending" as const,
      attempts: 0,
      maxAttempts: 5,
      expiresAt: "2026-06-16T10:10:00.000Z",
      resendAvailableAt: "2026-06-16T10:01:00.000Z",
      createdAt: "2026-06-16T10:00:00.000Z",
      updatedAt: "2026-06-16T10:00:00.000Z"
    })),
    incrementChallengeAttempts: vi.fn(async () => undefined),
    consumeChallenge: vi.fn(async () => undefined),
    findAuthIdentityByProviderSubject: vi.fn(async () => null),
    createUser: vi.fn(async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      status: "active" as const,
      createdAt: "2026-06-16T10:00:00.000Z",
      updatedAt: "2026-06-16T10:00:00.000Z"
    })),
    createUserProfile: vi.fn(async (input) => ({
      userId: input.userId,
      displayName: input.displayName,
      createdAt: "2026-06-16T10:00:00.000Z",
      updatedAt: "2026-06-16T10:00:00.000Z"
    })),
    createAuthIdentity: vi.fn(async (input) => ({
      id: "identity_1",
      userId: input.userId,
      provider: "email" as const,
      providerSubject: "client@example.com",
      email: "client@example.com",
      emailVerifiedAt: "2026-06-16T10:00:00.000Z",
      createdAt: "2026-06-16T10:00:00.000Z",
      updatedAt: "2026-06-16T10:00:00.000Z"
    })),
    assignRole: vi.fn(async (input) => ({
      id: "role_client",
      userId: input.userId,
      role: input.role,
      assignedAt: "2026-06-16T10:00:00.000Z"
    })),
    createSession: vi.fn(async (input) => ({
      id: "session_1",
      status: "active" as const,
      ...input
    })),
    recordSecurityEvent: vi.fn(async (input) => ({
      id: "event_1",
      ...input,
      metadata: {}
    })),
    findJoinIntentByTokenHash: vi.fn(async () => ({
      id: "44444444-4444-4444-8444-444444444444",
      astrologerUserId: "22222222-2222-4222-8222-222222222222",
      tokenHash: "sha256:e33b027e982588fdc45c1182c93d740ab110e2bee6d20a71f6279b400ddd425d",
      publicHandleSnapshot: "alisa-vega",
      status: "pending" as const,
      expiresAt: "2026-06-16T10:30:00.000Z",
      claimedByClientUserId: null,
      claimedAt: null,
      createdAt: "2026-06-16T10:00:00.000Z",
      updatedAt: "2026-06-16T10:00:00.000Z"
    })),
    ensureRelationship: vi.fn(async (input) => ({
      id: "relationship_1",
      clientUserId: input.clientUserId,
      astrologerUserId: input.astrologerUserId,
      source: "direct_link" as const,
      status: "active" as const,
      firstLinkedAt: input.now,
      lastLinkedAt: input.now,
      archivedAt: null,
      blockedAt: null,
      createdAt: input.now,
      updatedAt: input.now
    })),
    markJoinIntentClaimed: vi.fn(async (input) => ({
      id: input.intentId,
      astrologerUserId: "22222222-2222-4222-8222-222222222222",
      tokenHash: "sha256:e33b027e982588fdc45c1182c93d740ab110e2bee6d20a71f6279b400ddd425d",
      publicHandleSnapshot: "alisa-vega",
      status: "claimed" as const,
      expiresAt: "2026-06-16T10:30:00.000Z",
      claimedByClientUserId: input.clientUserId,
      claimedAt: input.now,
      createdAt: "2026-06-16T10:00:00.000Z",
      updatedAt: input.now
    }))
  } satisfies PasswordlessCustomerAccountRegistrationSessionStore &
    ClientJoinIntentClaimStore;
}
