import { createAuthenticatedSession, resolveAuthenticatedSession } from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";
import { authSecurityEvents, userSessions } from "../../../schema";
import {
  createDrizzleAuthSessionAuthenticationStore,
  createDrizzleAuthSessionCreationUnitOfWork,
  type AuthSessionAuthenticationDrizzleDatabase,
  type AuthSessionCreationDrizzleDatabase,
  type AuthSessionCreationDrizzleExecutor
} from "./index";

type InsertCall = {
  readonly table: unknown;
  readonly value: Record<string, unknown>;
};
type FakeInsertResult = Record<string, unknown> | Error;

type FakeCreationDatabase = AuthSessionCreationDrizzleDatabase & {
  readonly inserts: InsertCall[];
  readonly transactionCalls: number;
};

function createFakeCreationDatabase(rows: readonly FakeInsertResult[]): FakeCreationDatabase {
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
  })) as unknown as AuthSessionCreationDrizzleExecutor["insert"];
  const executor: AuthSessionCreationDrizzleExecutor = { insert };

  return {
    inserts,
    get transactionCalls() {
      return transactionCalls;
    },
    transaction: async <T>(
      operation: (executor: AuthSessionCreationDrizzleExecutor) => Promise<T>
    ) => {
      transactionCalls += 1;
      return operation(executor);
    }
  } as unknown as FakeCreationDatabase;
}

describe("createDrizzleAuthSessionCreationUnitOfWork", () => {
  it("persists auth session creation and security event in one transaction", async () => {
    const createdAt = new Date("2026-06-14T10:00:00.000Z");
    const expiresAt = new Date("2026-06-21T10:00:00.000Z");
    const database = createFakeCreationDatabase([
      {
        id: "session_1",
        userId: "user_1",
        tokenHash: "token_hash",
        status: "active",
        userAgent: "Mozilla/5.0",
        ipAddress: "127.0.0.1",
        createdAt,
        lastSeenAt: null,
        expiresAt,
        revokedAt: null
      },
      {
        id: "event_1",
        userId: "user_1",
        sessionId: "session_1",
        eventType: "registration_succeeded",
        occurredAt: createdAt,
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0",
        metadata: {}
      }
    ]);

    const result = await createAuthenticatedSession({
      sessionCreation: createDrizzleAuthSessionCreationUnitOfWork(database),
      userId: "user_1",
      tokenHash: "token_hash",
      createdAt,
      expiresAt,
      securityEventType: "registration_succeeded",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0"
    });

    expect(database.transactionCalls).toBe(1);
    expect(database.inserts).toEqual([
      {
        table: userSessions,
        value: {
          userId: "user_1",
          tokenHash: "token_hash",
          createdAt,
          expiresAt,
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
          occurredAt: createdAt,
          ipAddress: "127.0.0.1",
          userAgent: "Mozilla/5.0"
        }
      }
    ]);
    expect(result).toEqual({
      session: {
        id: "session_1",
        userId: "user_1",
        tokenHash: "token_hash",
        status: "active",
        createdAt: "2026-06-14T10:00:00.000Z",
        expiresAt: "2026-06-21T10:00:00.000Z",
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0"
      },
      securityEvent: {
        id: "event_1",
        userId: "user_1",
        sessionId: "session_1",
        eventType: "registration_succeeded",
        occurredAt: "2026-06-14T10:00:00.000Z",
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0",
        metadata: {}
      }
    });
  });
});

describe("createDrizzleAuthSessionAuthenticationStore", () => {
  it("maps joined session, account and role rows into an authenticated session context", async () => {
    const now = new Date("2026-06-14T10:00:00.000Z");
    const expiresAt = new Date("2026-06-21T10:00:00.000Z");
    const roleAssignedAt = new Date("2026-06-14T10:01:00.000Z");
    const database: AuthSessionAuthenticationDrizzleDatabase = {
      query: {
        userSessions: {
          findFirst: async () => ({
            id: "session_1",
            userId: "user_1",
            tokenHash: "token_hash",
            status: "active",
            createdAt: now,
            lastSeenAt: null,
            expiresAt,
            revokedAt: null,
            userAgent: "Mozilla/5.0",
            ipAddress: "127.0.0.1",
            user: {
              id: "user_1",
              status: "active",
              createdAt: now,
              updatedAt: now,
              roleAssignments: [
                {
                  id: "role_1",
                  userId: "user_1",
                  role: "client",
                  assignedByUserId: null,
                  assignedAt: roleAssignedAt
                }
              ]
            }
          })
        }
      }
    } as unknown as AuthSessionAuthenticationDrizzleDatabase;

    await expect(
      resolveAuthenticatedSession({
        store: createDrizzleAuthSessionAuthenticationStore(database),
        tokenHash: "token_hash",
        now
      })
    ).resolves.toEqual({
      session: {
        id: "session_1",
        userId: "user_1",
        tokenHash: "token_hash",
        status: "active",
        createdAt: "2026-06-14T10:00:00.000Z",
        expiresAt: "2026-06-21T10:00:00.000Z",
        userAgent: "Mozilla/5.0",
        ipAddress: "127.0.0.1"
      },
      user: {
        id: "user_1",
        status: "active",
        createdAt: "2026-06-14T10:00:00.000Z",
        updatedAt: "2026-06-14T10:00:00.000Z"
      },
      roleAssignments: [
        {
          id: "role_1",
          userId: "user_1",
          role: "client",
          assignedAt: "2026-06-14T10:01:00.000Z"
        }
      ]
    });
  });

  it("returns null when no row exists for a token hash", async () => {
    const database: AuthSessionAuthenticationDrizzleDatabase = {
      query: {
        userSessions: {
          findFirst: async () => null
        }
      }
    } as unknown as AuthSessionAuthenticationDrizzleDatabase;

    await expect(
      createDrizzleAuthSessionAuthenticationStore(database).findByTokenHash("missing_hash")
    ).resolves.toBeNull();
  });
});
