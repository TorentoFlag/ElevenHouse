import type {
  AccountRegistrationStore,
  AccountRegistrationUnitOfWork,
  AuthIdentity,
  AuthIdentityInput,
  IdentityProvider,
  UserAccount,
  UserAccountStatus,
  UserRoleAssignment
} from "@elevenhouse/domain";
import { authIdentities, userRoleAssignments, users } from "./schema";

type AccountRegistrationTable =
  | typeof users
  | typeof authIdentities
  | typeof userRoleAssignments;

export type AccountRegistrationDrizzleExecutor = {
  readonly insert: (table: AccountRegistrationTable) => {
    readonly values: (value: Record<string, unknown>) => {
      readonly returning: () => Promise<readonly Record<string, unknown>[]>;
    };
  };
};

export type AccountRegistrationDrizzleDatabase = {
  readonly transaction: <T>(
    operation: (executor: AccountRegistrationDrizzleExecutor) => Promise<T>
  ) => Promise<T>;
};

export function createDrizzleAccountRegistrationUnitOfWork(
  database: AccountRegistrationDrizzleDatabase
): AccountRegistrationUnitOfWork {
  return {
    transact: (operation) =>
      database.transaction((executor) => operation(createAccountRegistrationStore(executor)))
  };
}

function createAccountRegistrationStore(
  executor: AccountRegistrationDrizzleExecutor
): AccountRegistrationStore {
  return {
    createUser: async (input) => {
      const row = await insertReturningOne(executor, users, input, "users");

      return {
        id: readString(row, "id"),
        status: readString(row, "status") as UserAccountStatus,
        createdAt: readTimestamp(row, "createdAt"),
        updatedAt: readTimestamp(row, "updatedAt")
      } satisfies UserAccount;
    },
    createAuthIdentity: async (input) => {
      const row = await insertReturningOne(
        executor,
        authIdentities,
        {
          userId: input.userId,
          provider: input.provider,
          providerSubject: input.providerSubject,
          email: input.email,
          phoneNumber: input.phoneNumber,
          passwordHash: input.passwordHash
        },
        "auth_identities"
      );

      return {
        id: readString(row, "id"),
        userId: readString(row, "userId"),
        provider: readString(row, "provider") as IdentityProvider,
        providerSubject: readString(row, "providerSubject"),
        email: readOptionalString(row, "email"),
        phoneNumber: readOptionalString(row, "phoneNumber"),
        createdAt: readTimestamp(row, "createdAt"),
        updatedAt: readTimestamp(row, "updatedAt")
      } satisfies AuthIdentity;
    },
    assignRole: async (input) => {
      const row = await insertReturningOne(
        executor,
        userRoleAssignments,
        {
          userId: input.userId,
          role: input.role,
          assignedByUserId: input.assignedByUserId
        },
        "user_role_assignments"
      );

      return {
        id: readString(row, "id"),
        userId: readString(row, "userId"),
        role: readString(row, "role") as UserRoleAssignment["role"],
        assignedByUserId: readOptionalString(row, "assignedByUserId"),
        assignedAt: readTimestamp(row, "assignedAt")
      } satisfies UserRoleAssignment;
    }
  };
}

async function insertReturningOne(
  executor: AccountRegistrationDrizzleExecutor,
  table: AccountRegistrationTable,
  value: AuthIdentityInput | Record<string, unknown>,
  tableName: string
): Promise<Record<string, unknown>> {
  const rows = await executor.insert(table).values(value).returning();
  const row = rows[0];

  if (!row) {
    throw new Error(`Expected ${tableName} insert to return a row`);
  }

  return row;
}

function readString(row: Record<string, unknown>, key: string): string {
  const value = row[key];

  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be a string`);
  }

  return value;
}

function readOptionalString(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];

  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be a string when present`);
  }

  return value;
}

function readTimestamp(row: Record<string, unknown>, key: string): string {
  const value = row[key];

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return new Date(value).toISOString();
  }

  throw new Error(`Expected ${key} to be a timestamp`);
}
