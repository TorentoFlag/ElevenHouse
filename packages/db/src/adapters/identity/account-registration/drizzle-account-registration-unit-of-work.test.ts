import { registerCustomerAccount } from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";
import { createDrizzleAccountRegistrationUnitOfWork } from "./index";
import type {
  AccountRegistrationDrizzleDatabase,
  AccountRegistrationDrizzleExecutor
} from "./index";
import { authIdentities, userRoleAssignments, users } from "../../../schema";

type InsertCall = {
  readonly table: unknown;
  readonly value: Record<string, unknown>;
};

type FakeDrizzleDatabase = AccountRegistrationDrizzleDatabase & {
  readonly inserts: InsertCall[];
  readonly transactionCalls: number;
};

function createFakeDrizzleDatabase(rows: readonly Record<string, unknown>[]): FakeDrizzleDatabase {
  const inserts: InsertCall[] = [];
  let transactionCalls = 0;
  let nextRowIndex = 0;

  const insert = ((table: unknown) => ({
    values: (value: Record<string, unknown>) => ({
      returning: async () => {
        inserts.push({ table, value });

        const row = rows[nextRowIndex];
        nextRowIndex += 1;

        return row ? [row] : [];
      }
    })
  })) as unknown as AccountRegistrationDrizzleExecutor["insert"];
  const executor: AccountRegistrationDrizzleExecutor = { insert };

  return {
    inserts,
    get transactionCalls() {
      return transactionCalls;
    },
    transaction: async <T>(
      operation: (executor: AccountRegistrationDrizzleExecutor) => Promise<T>
    ) => {
      transactionCalls += 1;
      return operation(executor);
    }
  } as unknown as FakeDrizzleDatabase;
}

describe("createDrizzleAccountRegistrationUnitOfWork", () => {
  it("persists customer registration through Drizzle tables in one transaction", async () => {
    const now = new Date("2026-06-12T00:00:00.000Z");
    const database = createFakeDrizzleDatabase([
      {
        id: "user_1",
        status: "active",
        deletionRequestedAt: null,
        deletionScheduledAt: null,
        deletedAt: null,
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
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        passwordHash: "argon2$hash",
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
        providerSubject: " ada@example.com ",
        email: " ada@example.com ",
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
        table: userRoleAssignments,
        value: {
          userId: "user_1",
          role: "astrologer"
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
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:00.000Z"
      },
      roleAssignments: [
        {
          id: "role_client",
          userId: "user_1",
          role: "client",
          assignedAt: "2026-06-12T00:00:00.000Z"
        },
        {
          id: "role_astrologer",
          userId: "user_1",
          role: "astrologer",
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
          email: "ada@example.com",
          passwordHash: "argon2$hash"
        },
        roles: ["client"]
      })
    ).rejects.toThrow("Expected users insert to return a row");
  });

  it("rejects unexpected returned role values before exposing a domain result", async () => {
    const now = new Date("2026-06-12T00:00:00.000Z");
    const database = createFakeDrizzleDatabase([
      {
        id: "user_1",
        status: "active",
        deletionRequestedAt: null,
        deletionScheduledAt: null,
        deletedAt: null,
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
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        passwordHash: "argon2$hash",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "role_owner",
        userId: "user_1",
        role: "owner",
        assignedByUserId: null,
        assignedAt: now
      }
    ]);

    await expect(
      registerCustomerAccount({
        accountRegistration: createDrizzleAccountRegistrationUnitOfWork(database),
        identity: {
          provider: "email",
          providerSubject: "ada@example.com",
          email: "ada@example.com",
          passwordHash: "argon2$hash"
        },
        roles: ["client"]
      })
    ).rejects.toThrow("Unexpected user_role_assignments.role value: owner");
  });
});
