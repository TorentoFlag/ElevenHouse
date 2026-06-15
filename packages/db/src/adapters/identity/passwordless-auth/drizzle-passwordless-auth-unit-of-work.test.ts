import {
  hashPasswordlessCode,
  requestPasswordlessCode,
  verifyPasswordlessCode
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import {
  authChallengeDeliveries,
  authChallenges,
  authIdentities,
  authSecurityEvents,
  userRoleAssignments,
  users,
  userSessions
} from "../../../schema";
import {
  createDrizzlePasswordlessAuthUnitOfWork,
  type PasswordlessAuthDrizzleDatabase,
  type PasswordlessAuthDrizzleExecutor
} from "./index";

type InsertCall = {
  readonly table: unknown;
  readonly value: Record<string, unknown>;
};
type UpdateCall = {
  readonly table: unknown;
  readonly value: Record<string, unknown>;
};
type QueryCall = {
  readonly table: "authChallenges" | "authIdentities";
  readonly args: unknown;
};
type FakeInsertResult = Record<string, unknown> | Error;

type FakeDrizzleDatabase = PasswordlessAuthDrizzleDatabase & {
  readonly inserts: InsertCall[];
  readonly updates: UpdateCall[];
  readonly queries: QueryCall[];
  readonly transactionCalls: number;
};

const baseNow = new Date("2026-06-15T10:00:00.000Z");
const verifyNow = new Date("2026-06-15T10:03:00.000Z");
const expiresAt = new Date("2026-06-15T10:10:00.000Z");
const resendAvailableAt = new Date("2026-06-15T10:01:00.000Z");
const codeSecret = "test-secret";

function createFakeDrizzleDatabase(input: {
  readonly insertRows?: readonly FakeInsertResult[];
  readonly challengeRows?: readonly (Record<string, unknown> | null)[];
  readonly identityRows?: readonly (Record<string, unknown> | null)[];
}): FakeDrizzleDatabase {
  const inserts: InsertCall[] = [];
  const updates: UpdateCall[] = [];
  const queries: QueryCall[] = [];
  let transactionCalls = 0;
  let nextInsertRowIndex = 0;
  let nextChallengeRowIndex = 0;
  let nextIdentityRowIndex = 0;

  const insert = ((table: unknown) => ({
    values: (value: Record<string, unknown>) => ({
      returning: async () => {
        inserts.push({ table, value });

        const row = input.insertRows?.[nextInsertRowIndex];
        nextInsertRowIndex += 1;

        if (row instanceof Error) {
          throw row;
        }

        return row ? [row] : [];
      }
    })
  })) as unknown as PasswordlessAuthDrizzleExecutor["insert"];
  const update = ((table: unknown) => ({
    set: (value: Record<string, unknown>) => ({
      where: async () => {
        updates.push({ table, value });
      }
    })
  })) as unknown as PasswordlessAuthDrizzleExecutor["update"];
  const query = {
    authChallenges: {
      findFirst: async (args: unknown) => {
        queries.push({ table: "authChallenges", args });
        const row = input.challengeRows?.[nextChallengeRowIndex] ?? null;
        nextChallengeRowIndex += 1;
        return row;
      }
    },
    authIdentities: {
      findFirst: async (args: unknown) => {
        queries.push({ table: "authIdentities", args });
        const row = input.identityRows?.[nextIdentityRowIndex] ?? null;
        nextIdentityRowIndex += 1;
        return row;
      }
    }
  } as unknown as PasswordlessAuthDrizzleExecutor["query"];
  const executor: PasswordlessAuthDrizzleExecutor = { insert, update, query };

  return {
    inserts,
    updates,
    queries,
    get transactionCalls() {
      return transactionCalls;
    },
    transaction: async <T>(
      operation: (executor: PasswordlessAuthDrizzleExecutor) => Promise<T>
    ) => {
      transactionCalls += 1;
      return operation(executor);
    }
  } as unknown as FakeDrizzleDatabase;
}

function createChallengeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "8e14390f-3db1-4d1c-9344-55679c778427",
    channel: "email",
    identifier: "ada@example.com",
    identifierNormalized: "ada@example.com",
    codeHash: hashPasswordlessCode({
      secret: codeSecret,
      channel: "email",
      identifierNormalized: "ada@example.com",
      code: "123456"
    }),
    requestedRoles: ["client"],
    status: "pending",
    attempts: 0,
    maxAttempts: 5,
    expiresAt,
    resendAvailableAt,
    consumedAt: null,
    cancelledAt: null,
    ipAddress: null,
    userAgent: null,
    createdAt: baseNow,
    updatedAt: baseNow,
    ...overrides
  };
}

function createDeliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "delivery_1",
    challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
    channel: "email",
    provider: "dev",
    status: "sent",
    providerMessageId: "dev-message-1",
    errorCode: null,
    errorMessage: null,
    createdAt: baseNow,
    sentAt: baseNow,
    ...overrides
  };
}

function createUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    status: "active",
    deletionRequestedAt: null,
    deletionScheduledAt: null,
    deletedAt: null,
    createdAt: verifyNow,
    updatedAt: verifyNow,
    ...overrides
  };
}

function createAuthIdentityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "identity_1",
    userId: "user_1",
    provider: "email",
    providerSubject: "ada@example.com",
    email: "ada@example.com",
    phoneNumber: null,
    emailVerifiedAt: verifyNow,
    phoneVerifiedAt: null,
    createdAt: verifyNow,
    updatedAt: verifyNow,
    ...overrides
  };
}

function createRoleAssignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "role_client",
    userId: "user_1",
    role: "client",
    assignedByUserId: null,
    assignedAt: verifyNow,
    ...overrides
  };
}

function createSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "session_1",
    userId: "user_1",
    tokenHash: "session_hash",
    status: "active",
    createdAt: verifyNow,
    expiresAt: new Date("2026-06-22T10:03:00.000Z"),
    lastSeenAt: null,
    revokedAt: null,
    ipAddress: null,
    userAgent: null,
    ...overrides
  };
}

function createSecurityEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "event_1",
    eventType: "registration_succeeded",
    occurredAt: verifyNow,
    userId: "user_1",
    sessionId: "session_1",
    ipAddress: null,
    userAgent: null,
    metadata: {},
    ...overrides
  };
}

describe("createDrizzlePasswordlessAuthUnitOfWork", () => {
  it("persists a passwordless code request in one transaction", async () => {
    const database = createFakeDrizzleDatabase({
      insertRows: [createChallengeRow(), createDeliveryRow()]
    });
    const delivery = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "dev",
        status: "sent" as const,
        providerMessageId: "dev-message-1"
      }))
    };

    const result = await createDrizzlePasswordlessAuthUnitOfWork(database).transact((store) =>
      requestPasswordlessCode({
        store,
        delivery,
        channel: "email",
        identifier: " ADA@example.COM ",
        roles: ["client"],
        code: "123456",
        codeSecret,
        now: baseNow,
        ttlSeconds: 600,
        resendCooldownSeconds: 60,
        maxAttempts: 5,
        ipAddress: " 127.0.0.1 ",
        userAgent: " test-agent "
      })
    );

    expect(database.transactionCalls).toBe(1);
    expect(database.inserts).toEqual([
      {
        table: authChallenges,
        value: {
          channel: "email",
          identifier: "ADA@example.COM",
          identifierNormalized: "ada@example.com",
          codeHash: expect.any(String),
          requestedRoles: ["client"],
          maxAttempts: 5,
          expiresAt,
          resendAvailableAt,
          ipAddress: "127.0.0.1",
          userAgent: "test-agent"
        }
      },
      {
        table: authChallengeDeliveries,
        value: {
          challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
          channel: "email",
          provider: "dev",
          status: "sent",
          providerMessageId: "dev-message-1",
          sentAt: baseNow
        }
      }
    ]);
    expect(result).toEqual({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email",
      maskedIdentifier: "a***@example.com",
      expiresAt: "2026-06-15T10:10:00.000Z",
      resendAvailableAt: "2026-06-15T10:01:00.000Z"
    });
  });

  it("creates an active account and verified identity when a challenge has no linked identity", async () => {
    const database = createFakeDrizzleDatabase({
      challengeRows: [createChallengeRow()],
      identityRows: [null],
      insertRows: [
        createUserRow(),
        createAuthIdentityRow(),
        createRoleAssignmentRow(),
        createSessionRow(),
        createSecurityEventRow()
      ]
    });

    const result = await createDrizzlePasswordlessAuthUnitOfWork(database).transact((store) =>
      verifyPasswordlessCode({
        store,
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        codeSecret,
        now: verifyNow,
        session: {
          tokenHash: " session_hash ",
          createdAt: verifyNow,
          expiresAt: new Date("2026-06-22T10:03:00.000Z")
        }
      })
    );

    expect(database.updates).toEqual([
      {
        table: authChallenges,
        value: {
          status: "consumed",
          consumedAt: verifyNow,
          updatedAt: verifyNow
        }
      }
    ]);
    expect(database.inserts).toEqual([
      {
        table: users,
        value: { status: "active" }
      },
      {
        table: authIdentities,
        value: {
          userId: "user_1",
          provider: "email",
          providerSubject: "ada@example.com",
          email: "ada@example.com",
          emailVerifiedAt: verifyNow
        }
      },
      {
        table: userRoleAssignments,
        value: {
          userId: "user_1",
          role: "client"
        }
      },
      {
        table: userSessions,
        value: {
          userId: "user_1",
          tokenHash: "session_hash",
          createdAt: verifyNow,
          expiresAt: new Date("2026-06-22T10:03:00.000Z")
        }
      },
      {
        table: authSecurityEvents,
        value: {
          eventType: "registration_succeeded",
          occurredAt: verifyNow,
          userId: "user_1",
          sessionId: "session_1"
        }
      }
    ]);
    expect(result.authenticationKind).toBe("registration");
    expect(result.authIdentity.emailVerifiedAt).toBe("2026-06-15T10:03:00.000Z");
  });

  it("logs in an existing linked identity without assigning requested roles again", async () => {
    const database = createFakeDrizzleDatabase({
      challengeRows: [createChallengeRow({ requestedRoles: ["client", "astrologer"] })],
      identityRows: [
        {
          ...createAuthIdentityRow(),
          user: {
            ...createUserRow(),
            roleAssignments: [createRoleAssignmentRow()]
          }
        }
      ],
      insertRows: [
        createSessionRow(),
        createSecurityEventRow({ eventType: "login_succeeded" })
      ]
    });

    const result = await createDrizzlePasswordlessAuthUnitOfWork(database).transact((store) =>
      verifyPasswordlessCode({
        store,
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        codeSecret,
        now: verifyNow,
        session: {
          tokenHash: "session_hash",
          createdAt: verifyNow,
          expiresAt: new Date("2026-06-22T10:03:00.000Z")
        }
      })
    );

    expect(database.queries.map((query) => query.table)).toEqual([
      "authChallenges",
      "authIdentities"
    ]);
    expect(database.inserts).toEqual([
      {
        table: userSessions,
        value: {
          userId: "user_1",
          tokenHash: "session_hash",
          createdAt: verifyNow,
          expiresAt: new Date("2026-06-22T10:03:00.000Z")
        }
      },
      {
        table: authSecurityEvents,
        value: {
          eventType: "login_succeeded",
          occurredAt: verifyNow,
          userId: "user_1",
          sessionId: "session_1"
        }
      }
    ]);
    expect(result.authenticationKind).toBe("login");
    expect(result.roleAssignments).toEqual([
      {
        id: "role_client",
        userId: "user_1",
        role: "client",
        assignedAt: "2026-06-15T10:03:00.000Z"
      }
    ]);
  });

  it("increments attempts and records a failed event for an incorrect code", async () => {
    const database = createFakeDrizzleDatabase({
      challengeRows: [createChallengeRow()],
      insertRows: [createSecurityEventRow({ eventType: "login_failed", userId: null, sessionId: null })]
    });

    await expect(
      createDrizzlePasswordlessAuthUnitOfWork(database).transact((store) =>
        verifyPasswordlessCode({
          store,
          challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
          code: "000000",
          codeSecret,
          now: verifyNow,
          session: {
            tokenHash: "session_hash",
            createdAt: verifyNow,
            expiresAt: new Date("2026-06-22T10:03:00.000Z")
          }
        })
      )
    ).rejects.toThrow("Invalid or expired passwordless code");

    expect(database.updates).toHaveLength(1);
    expect(database.updates[0]).toMatchObject({
      table: authChallenges,
      value: {
        updatedAt: verifyNow
      }
    });
    expect(database.updates[0]?.value.attempts).toBeDefined();
    expect(database.inserts).toEqual([
      {
        table: authSecurityEvents,
        value: {
          eventType: "login_failed",
          occurredAt: verifyNow,
          metadata: {
            challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
            channel: "email"
          }
        }
      }
    ]);
  });
});
