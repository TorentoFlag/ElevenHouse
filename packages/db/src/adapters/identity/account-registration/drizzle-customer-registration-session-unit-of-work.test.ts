import { registerCustomerAccountWithSession } from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";
import {
  authIdentities,
  authSecurityEvents,
  userRoleAssignments,
  userSessions,
  users
} from "../../../schema";
import {
  createDrizzleCustomerAccountRegistrationSessionUnitOfWork,
  type CustomerAccountRegistrationSessionDrizzleDatabase,
  type CustomerAccountRegistrationSessionDrizzleExecutor
} from "./index";

type InsertCall = {
  readonly table: unknown;
  readonly value: Record<string, unknown>;
};
type FakeInsertResult = Record<string, unknown> | Error;

type FakeDrizzleDatabase = CustomerAccountRegistrationSessionDrizzleDatabase & {
  readonly inserts: InsertCall[];
  readonly transactionCalls: number;
};

function createFakeDrizzleDatabase(rows: readonly FakeInsertResult[]): FakeDrizzleDatabase {
  const inserts: InsertCall[] = [];
  let transactionCalls = 0;
  let nextRowIndex = 0;

  const insert = ((table: unknown) => ({
    values: (value: Record<string, unknown>) => ({
      returning: async () => {
        inserts.push({ table, value });

        const row = rows[nextRowIndex];
        nextRowIndex += 1;

        if (row instanceof Error) {
          throw row;
        }

        return row ? [row] : [];
      }
    })
  })) as unknown as CustomerAccountRegistrationSessionDrizzleExecutor["insert"];
  const executor: CustomerAccountRegistrationSessionDrizzleExecutor = { insert };

  return {
    inserts,
    get transactionCalls() {
      return transactionCalls;
    },
    transaction: async <T>(
      operation: (executor: CustomerAccountRegistrationSessionDrizzleExecutor) => Promise<T>
    ) => {
      transactionCalls += 1;
      return operation(executor);
    }
  } as unknown as FakeDrizzleDatabase;
}

describe("createDrizzleCustomerAccountRegistrationSessionUnitOfWork", () => {
  it("persists account registration and initial session through one Drizzle transaction", async () => {
    const accountCreatedAt = new Date("2026-06-15T00:00:00.000Z");
    const sessionCreatedAt = new Date("2026-06-15T10:00:00.000Z");
    const sessionExpiresAt = new Date("2026-06-22T10:00:00.000Z");
    const database = createFakeDrizzleDatabase([
      {
        id: "user_1",
        status: "active",
        deletionRequestedAt: null,
        deletionScheduledAt: null,
        deletedAt: null,
        createdAt: accountCreatedAt,
        updatedAt: accountCreatedAt
      },
      {
        id: "identity_1",
        userId: "user_1",
        provider: "email",
        providerSubject: "ada@example.com",
        email: "ada@example.com",
        phoneNumber: null,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        passwordHash: "argon2$hash",
        createdAt: accountCreatedAt,
        updatedAt: accountCreatedAt
      },
      {
        id: "role_client",
        userId: "user_1",
        role: "client",
        assignedByUserId: null,
        assignedAt: accountCreatedAt
      },
      {
        id: "session_1",
        userId: "user_1",
        tokenHash: "session_hash",
        status: "active",
        userAgent: "Mozilla/5.0",
        ipAddress: "127.0.0.1",
        createdAt: sessionCreatedAt,
        lastSeenAt: null,
        expiresAt: sessionExpiresAt,
        revokedAt: null
      },
      {
        id: "event_1",
        userId: "user_1",
        sessionId: "session_1",
        eventType: "registration_succeeded",
        occurredAt: sessionCreatedAt,
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0",
        metadata: {}
      }
    ]);

    const result = await registerCustomerAccountWithSession({
      registration: createDrizzleCustomerAccountRegistrationSessionUnitOfWork(database),
      identity: {
        provider: "email",
        providerSubject: "ada@example.com",
        email: "ada@example.com",
        passwordHash: "argon2$hash"
      },
      roles: ["client"],
      session: {
        tokenHash: "session_hash",
        createdAt: sessionCreatedAt,
        expiresAt: sessionExpiresAt,
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0"
      },
      securityEventType: "registration_succeeded"
    });

    expect(database.transactionCalls).toBe(1);
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
          passwordHash: "argon2$hash"
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
          createdAt: sessionCreatedAt,
          expiresAt: sessionExpiresAt,
          ipAddress: "127.0.0.1",
          userAgent: "Mozilla/5.0"
        }
      },
      {
        table: authSecurityEvents,
        value: {
          userId: "user_1",
          sessionId: "session_1",
          eventType: "registration_succeeded",
          occurredAt: sessionCreatedAt,
          ipAddress: "127.0.0.1",
          userAgent: "Mozilla/5.0"
        }
      }
    ]);
    expect(result.session).toMatchObject({
      id: "session_1",
      userId: "user_1",
      tokenHash: "session_hash",
      status: "active"
    });
    expect(result.securityEvent).toMatchObject({
      id: "event_1",
      userId: "user_1",
      sessionId: "session_1",
      eventType: "registration_succeeded"
    });
  });
});
