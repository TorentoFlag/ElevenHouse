import {
  hashPasswordlessCode,
  PasswordlessCodeRequestCooldownError,
  PasswordlessCodeVerificationError,
  requestPasswordlessCode,
  verifyPasswordlessCode
} from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";
import {
  authChallengeDeliveries,
  authChallenges,
  authIdentities,
  authSecurityEvents,
  outboxEvents,
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
  readonly table: "authChallenges" | "authChallengeDeliveries" | "authIdentities";
  readonly args: unknown;
};
type FakeInsertResult = Record<string, unknown> | Error;
type FakeUpdateResult = Record<string, unknown> | null;

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
  readonly updateRows?: readonly FakeUpdateResult[];
  readonly challengeRows?: readonly (Record<string, unknown> | null)[];
  readonly deliveryRows?: readonly (Record<string, unknown> | null)[];
  readonly identityRows?: readonly (Record<string, unknown> | null)[];
}): FakeDrizzleDatabase {
  const inserts: InsertCall[] = [];
  const updates: UpdateCall[] = [];
  const queries: QueryCall[] = [];
  let transactionCalls = 0;
  let nextInsertRowIndex = 0;
  let nextUpdateRowIndex = 0;
  let nextChallengeRowIndex = 0;
  let nextDeliveryRowIndex = 0;
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
      where: () => {
        updates.push({ table, value });

        return {
          returning: async () => {
            const row = input.updateRows?.[nextUpdateRowIndex];
            nextUpdateRowIndex += 1;

            if (row === null) {
              return [];
            }

            return [row ?? {}];
          }
        };
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
  const select = (() => ({
    from: (table: unknown) => ({
      where: (args: unknown) => ({
        orderBy: () => ({
          limit: async () => {
            if (table === authChallenges) {
              queries.push({ table: "authChallenges", args });
              const row = input.challengeRows?.[nextChallengeRowIndex] ?? null;
              nextChallengeRowIndex += 1;
              return row ? [row] : [];
            }

            if (table === authChallengeDeliveries) {
              queries.push({ table: "authChallengeDeliveries", args });
              const row = input.deliveryRows?.[nextDeliveryRowIndex] ?? null;
              nextDeliveryRowIndex += 1;
              return row ? [row] : [];
            }

            return [];
          }
        })
      })
    })
  })) as unknown as PasswordlessAuthDrizzleExecutor["select"];
  const executor: PasswordlessAuthDrizzleExecutor = { insert, update, query, select };

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
    provider: null,
    status: "queued",
    providerMessageId: null,
    errorCode: null,
    errorMessage: null,
    createdAt: baseNow,
    sentAt: null,
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

function createUniqueViolationError(constraint: string): Error {
  return Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
    constraint
  });
}

function createTestEncryption() {
  return {
    encryptAuthCode: (input: { readonly code: string }) => ({
      algorithm: "aes-256-gcm" as const,
      iv: "test-iv",
      ciphertext: `encrypted:${input.code}`,
      authTag: "test-auth-tag"
    })
  };
}

describe("createDrizzlePasswordlessAuthUnitOfWork", () => {
  it("persists a passwordless code request in one transaction", async () => {
    const database = createFakeDrizzleDatabase({
      insertRows: [createChallengeRow(), createDeliveryRow(), { id: "outbox_1" }]
    });

    const result = await createDrizzlePasswordlessAuthUnitOfWork(database).transact((store) =>
      requestPasswordlessCode({
        store,
        encryption: createTestEncryption(),
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
          status: "queued"
        }
      },
      {
        table: outboxEvents,
        value: {
          eventType: "identity.auth_code_delivery_requested",
          aggregateId: "delivery_1",
          payload: {
            challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
            deliveryId: "delivery_1",
            channel: "email",
            identifier: "ada@example.com",
            encryptedCode: {
              algorithm: "aes-256-gcm",
              iv: "test-iv",
              ciphertext: "encrypted:123456",
              authTag: "test-auth-tag"
            },
            expiresAt: "2026-06-15T10:10:00.000Z"
          },
          availableAt: baseNow
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

  it("rejects a duplicate passwordless code request while an existing challenge is in cooldown", async () => {
    const database = createFakeDrizzleDatabase({
      challengeRows: [createChallengeRow()],
      deliveryRows: [createDeliveryRow()]
    });

    await expect(
      createDrizzlePasswordlessAuthUnitOfWork(database).transact((store) =>
        requestPasswordlessCode({
          store,
          encryption: createTestEncryption(),
          channel: "email",
          identifier: "ADA@example.COM",
          roles: ["client"],
          code: "123456",
          codeSecret,
          now: baseNow,
          ttlSeconds: 600,
          resendCooldownSeconds: 60,
          maxAttempts: 5
        })
      )
    ).rejects.toBeInstanceOf(PasswordlessCodeRequestCooldownError);

    expect(database.queries.map((query) => query.table)).toEqual([
      "authChallenges",
      "authChallengeDeliveries"
    ]);
    expect(database.inserts).toEqual([]);
    expect(database.updates).toEqual([]);
  });

  it("replaces a pending challenge inside cooldown when its latest delivery failed", async () => {
    const replacementChallenge = createChallengeRow({
      id: "9e14390f-3db1-4d1c-9344-55679c778427",
      codeHash: hashPasswordlessCode({
        secret: codeSecret,
        channel: "email",
        identifierNormalized: "ada@example.com",
        code: "654321"
      })
    });
    const database = createFakeDrizzleDatabase({
      challengeRows: [createChallengeRow()],
      deliveryRows: [
        createDeliveryRow({
          status: "failed",
          errorCode: "provider_unavailable"
        })
      ],
      insertRows: [
        replacementChallenge,
        createDeliveryRow({
          id: "delivery_2",
          challengeId: "9e14390f-3db1-4d1c-9344-55679c778427"
        }),
        { id: "outbox_2" }
      ]
    });

    await expect(
      createDrizzlePasswordlessAuthUnitOfWork(database).transact((store) =>
        requestPasswordlessCode({
          store,
          encryption: createTestEncryption(),
          channel: "email",
          identifier: "ADA@example.COM",
          roles: ["client"],
          code: "654321",
          codeSecret,
          now: new Date("2026-06-15T10:00:30.000Z"),
          ttlSeconds: 600,
          resendCooldownSeconds: 60,
          maxAttempts: 5
        })
      )
    ).resolves.toMatchObject({
      challengeId: "9e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email",
      maskedIdentifier: "a***@example.com"
    });

    expect(database.queries.map((query) => query.table)).toEqual([
      "authChallenges",
      "authChallengeDeliveries"
    ]);
    expect(database.updates).toEqual([
      {
        table: authChallenges,
        value: {
          status: "cancelled",
          cancelledAt: new Date("2026-06-15T10:00:30.000Z"),
          updatedAt: new Date("2026-06-15T10:00:30.000Z")
        }
      }
    ]);
    expect(database.inserts.map((insert) => insert.table)).toEqual([
      authChallenges,
      authChallengeDeliveries,
      outboxEvents
    ]);
  });

  it("maps pending challenge insert races to passwordless resend cooldowns", async () => {
    const database = createFakeDrizzleDatabase({
      challengeRows: [null, createChallengeRow()],
      insertRows: [createUniqueViolationError("auth_challenges_pending_identifier_unique")]
    });

    await expect(
      createDrizzlePasswordlessAuthUnitOfWork(database).transact((store) =>
        requestPasswordlessCode({
          store,
          encryption: createTestEncryption(),
          channel: "email",
          identifier: "ada@example.com",
          roles: ["client"],
          code: "123456",
          codeSecret,
          now: baseNow,
          ttlSeconds: 600,
          resendCooldownSeconds: 60,
          maxAttempts: 5
        })
      )
    ).rejects.toBeInstanceOf(PasswordlessCodeRequestCooldownError);

    expect(database.queries.map((query) => query.table)).toEqual([
      "authChallenges",
      "authChallenges"
    ]);
    expect(database.inserts).toEqual([
      {
        table: authChallenges,
        value: {
          channel: "email",
          identifier: "ada@example.com",
          identifierNormalized: "ada@example.com",
          codeHash: expect.any(String),
          requestedRoles: ["client"],
          maxAttempts: 5,
          expiresAt,
          resendAvailableAt
        }
      }
    ]);
    expect(database.updates).toEqual([]);
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

  it("rejects verification when a concurrent verifier already consumed the challenge", async () => {
    const database = createFakeDrizzleDatabase({
      challengeRows: [createChallengeRow()],
      updateRows: [null]
    });

    await expect(
      createDrizzlePasswordlessAuthUnitOfWork(database).transact((store) =>
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
      )
    ).rejects.toBeInstanceOf(PasswordlessCodeVerificationError);

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
    expect(database.inserts).toEqual([]);
  });

  it("creates a verified phone identity for a phone challenge", async () => {
    const database = createFakeDrizzleDatabase({
      challengeRows: [
        createChallengeRow({
          channel: "phone",
          identifier: "+15551234090",
          identifierNormalized: "+15551234090",
          codeHash: hashPasswordlessCode({
            secret: codeSecret,
            channel: "phone",
            identifierNormalized: "+15551234090",
            code: "123456"
          })
        })
      ],
      identityRows: [null],
      insertRows: [
        createUserRow(),
        createAuthIdentityRow({
          provider: "phone",
          providerSubject: "+15551234090",
          email: null,
          phoneNumber: "+15551234090",
          emailVerifiedAt: null,
          phoneVerifiedAt: verifyNow
        }),
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
          tokenHash: "session_hash",
          createdAt: verifyNow,
          expiresAt: new Date("2026-06-22T10:03:00.000Z")
        }
      })
    );

    expect(database.inserts[1]).toEqual({
      table: authIdentities,
      value: {
        userId: "user_1",
        provider: "phone",
        providerSubject: "+15551234090",
        phoneNumber: "+15551234090",
        phoneVerifiedAt: verifyNow
      }
    });
    expect(result.authIdentity).toMatchObject({
      provider: "phone",
      phoneNumber: "+15551234090",
      phoneVerifiedAt: "2026-06-15T10:03:00.000Z"
    });
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

  it("rejects wrong-code verification when a concurrent update made the challenge unusable", async () => {
    const database = createFakeDrizzleDatabase({
      challengeRows: [createChallengeRow()],
      updateRows: [null]
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
    ).rejects.toBeInstanceOf(PasswordlessCodeVerificationError);

    expect(database.updates[0]).toMatchObject({
      table: authChallenges,
      value: {
        updatedAt: verifyNow
      }
    });
    expect(database.inserts).toEqual([]);
  });
});
