import { authIdentities, userRoleAssignments, users } from "@elevenhouse/db";
import {
  type AccountRegistrationStore,
  type AccountRegistrationUnitOfWork,
  type AuthIdentity,
  type AuthIdentityInput,
  type UserAccount,
  type UserRoleAssignment,
  isCustomerPlatformRole,
  isIdentityProvider,
  isUserAccountStatus
} from "./identity";

type UsersInsert = typeof users.$inferInsert;
type UsersSelect = typeof users.$inferSelect;
type AuthIdentitiesInsert = typeof authIdentities.$inferInsert;
type AuthIdentitiesSelect = typeof authIdentities.$inferSelect;
type UserRoleAssignmentsInsert = typeof userRoleAssignments.$inferInsert;
type UserRoleAssignmentsSelect = typeof userRoleAssignments.$inferSelect;

export type AccountRegistrationDrizzleExecutor = {
  readonly insert: {
    (table: typeof users): {
      readonly values: (value: UsersInsert) => {
        readonly returning: () => Promise<readonly UsersSelect[]>;
      };
    };
    (table: typeof authIdentities): {
      readonly values: (value: AuthIdentitiesInsert) => {
        readonly returning: () => Promise<readonly AuthIdentitiesSelect[]>;
      };
    };
    (table: typeof userRoleAssignments): {
      readonly values: (value: UserRoleAssignmentsInsert) => {
        readonly returning: () => Promise<readonly UserRoleAssignmentsSelect[]>;
      };
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
      const row = await insertReturningOne(
        () => executor.insert(users).values(input).returning(),
        "users"
      );

      const status = row.status;
      if (!isUserAccountStatus(status)) {
        throw new Error(`Unexpected users.status value: ${status}`);
      }

      return {
        id: row.id,
        status,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      } satisfies UserAccount;
    },
    createAuthIdentity: async (input) => {
      const row = await insertReturningOne(
        () => executor.insert(authIdentities).values(toAuthIdentityInsert(input)).returning(),
        "auth_identities"
      );

      const provider = row.provider;
      if (!isIdentityProvider(provider)) {
        throw new Error(`Unexpected auth_identities.provider value: ${provider}`);
      }

      return withoutUndefined({
        id: row.id,
        userId: row.userId,
        provider,
        providerSubject: row.providerSubject,
        email: optionalNullableString(row.email),
        phoneNumber: optionalNullableString(row.phoneNumber),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      }) satisfies AuthIdentity;
    },
    assignRole: async (input) => {
      const row = await insertReturningOne(
        () => executor.insert(userRoleAssignments).values(toRoleAssignmentInsert(input)).returning(),
        "user_role_assignments"
      );

      const role = row.role;
      if (!isCustomerPlatformRole(role)) {
        throw new Error(`Unexpected user_role_assignments.role value: ${role}`);
      }

      return withoutUndefined({
        id: row.id,
        userId: row.userId,
        role,
        assignedByUserId: optionalNullableString(row.assignedByUserId),
        assignedAt: row.assignedAt.toISOString()
      }) satisfies UserRoleAssignment;
    }
  };
}

async function insertReturningOne<TRow>(
  insert: () => Promise<readonly TRow[]>,
  tableName: string
): Promise<TRow> {
  const rows = await insert();
  const row = rows[0];

  if (!row) {
    throw new Error(`Expected ${tableName} insert to return a row`);
  }

  return row;
}

function toAuthIdentityInsert(
  input: AuthIdentityInput & { readonly userId: string }
): AuthIdentitiesInsert {
  return withoutUndefined({
    userId: input.userId,
    provider: input.provider,
    providerSubject: input.providerSubject,
    email: input.email,
    phoneNumber: input.phoneNumber,
    passwordHash: input.passwordHash
  });
}

function toRoleAssignmentInsert(input: {
  readonly userId: string;
  readonly role: UserRoleAssignment["role"];
  readonly assignedByUserId?: string;
}): UserRoleAssignmentsInsert {
  return withoutUndefined({
    userId: input.userId,
    role: input.role,
    assignedByUserId: input.assignedByUserId
  });
}

function optionalNullableString(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}
