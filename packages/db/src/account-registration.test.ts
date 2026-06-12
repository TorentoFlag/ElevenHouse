import { registerCustomerAccount } from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";
import { authIdentities, userRoleAssignments, users } from "./schema";
import {
  createDrizzleAccountRegistrationUnitOfWork,
  type AccountRegistrationDrizzleExecutor
} from "./index";

type InsertCall = {
  readonly table: unknown;
  readonly value: Record<string, unknown>;
};

function createFakeDrizzleDatabase(rows: readonly Record<string, unknown>[]) {
  const inserts: InsertCall[] = [];
  let transactionCalls = 0;
  let nextRowIndex = 0;

  return {
    inserts,
    get transactionCalls() {
      return transactionCalls;
    },
    transaction: async <T>(operation: (executor: AccountRegistrationDrizzleExecutor) => Promise<T>) => {
      transactionCalls += 1;

      return operation({
        insert: (table: unknown) => ({
          values: (value: Record<string, unknown>) => ({
            returning: async () => {
              inserts.push({ table, value });

              const row = rows[nextRowIndex];
              nextRowIndex += 1;

              return row ? [row] : [];
            }
          })
        })
      });
    }
  };
}

describe("createDrizzleAccountRegistrationUnitOfWork", () => {
  it("persists customer registration through Drizzle tables in one transaction", async () => {
    const now = new Date("2026-06-12T00:00:00.000Z");
    const database = createFakeDrizzleDatabase([
      {
        id: "user_1",
        status: "active",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "identity_1",
        userId: "user_1",
        provider: "email",
        providerSubject: "ada@example.com",
        email: "ada@example.com",
        phoneNumber: null,
        createdAt: now,
        updatedAt: now
      },
      {
        id: "role_client",
        userId: "user_1",
        role: "client",
        assignedByUserId: null,
        assignedAt: now
      },
      {
        id: "role_astrologer",
        userId: "user_1",
        role: "astrologer",
        assignedByUserId: null,
        assignedAt: now
      }
    ]);

    const result = await registerCustomerAccount({
      accountRegistration: createDrizzleAccountRegistrationUnitOfWork(database),
      identity: {
        provider: "email",
        providerSubject: "ada@example.com",
        email: "ada@example.com",
        passwordHash: "argon2$hash"
      },
      roles: ["client", "astrologer"]
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
          phoneNumber: undefined,
          passwordHash: "argon2$hash"
        }
      },
      {
        table: userRoleAssignments,
        value: {
          userId: "user_1",
          role: "client",
          assignedByUserId: undefined
        }
      },
      {
        table: userRoleAssignments,
        value: {
          userId: "user_1",
          role: "astrologer",
          assignedByUserId: undefined
        }
      }
    ]);
    expect(result).toEqual({
      user: {
        id: "user_1",
        status: "active",
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:00.000Z"
      },
      authIdentity: {
        id: "identity_1",
        userId: "user_1",
        provider: "email",
        providerSubject: "ada@example.com",
        email: "ada@example.com",
        phoneNumber: undefined,
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:00.000Z"
      },
      roleAssignments: [
        {
          id: "role_client",
          userId: "user_1",
          role: "client",
          assignedByUserId: undefined,
          assignedAt: "2026-06-12T00:00:00.000Z"
        },
        {
          id: "role_astrologer",
          userId: "user_1",
          role: "astrologer",
          assignedByUserId: undefined,
          assignedAt: "2026-06-12T00:00:00.000Z"
        }
      ]
    });
  });

  it("fails when an insert returns no row", async () => {
    const database = createFakeDrizzleDatabase([]);

    await expect(
      registerCustomerAccount({
        accountRegistration: createDrizzleAccountRegistrationUnitOfWork(database),
        identity: {
          provider: "email",
          providerSubject: "ada@example.com",
          email: "ada@example.com"
        },
        roles: ["client"]
      })
    ).rejects.toThrow("Expected users insert to return a row");
  });
});
