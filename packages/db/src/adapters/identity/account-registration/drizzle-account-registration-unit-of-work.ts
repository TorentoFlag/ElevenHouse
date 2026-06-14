import type {
  AccountRegistrationStore,
  AccountRegistrationUnitOfWork,
  AuthIdentityInput,
  IdentityProvider,
  UserAccountStatus
} from "@elevenhouse/domain";
import {
  authIdentities,
  databasePlatformRoleValues,
  identityProviderValues,
  userRoleAssignments,
  users,
  userStatusValues
} from "../../../schema";
import type { ElevenHouseDatabase } from "../../../runtime";
import { insertReturningOne } from "../../../shared/insert-returning-one";

type AuthIdentitiesInsert = typeof authIdentities.$inferInsert;
type UserRoleAssignmentsInsert = typeof userRoleAssignments.$inferInsert;
type CustomerPlatformRole = Extract<
  (typeof databasePlatformRoleValues)[number],
  "client" | "astrologer"
>;

export type AccountRegistrationDrizzleExecutor = Pick<ElevenHouseDatabase, "insert">;
export type AccountRegistrationDrizzleDatabase = Pick<ElevenHouseDatabase, "transaction">;

const userStatusSet = new Set<string>(userStatusValues);
const identityProviderSet = new Set<string>(identityProviderValues);
const customerRoleSet = new Set<string>(["client", "astrologer"]);

export function createDrizzleAccountRegistrationUnitOfWork(
  database: AccountRegistrationDrizzleDatabase
): AccountRegistrationUnitOfWork {
  return {
    transact: (operation) =>
      database.transaction((executor) => operation(createAccountRegistrationStore(executor)))
  };
}

export function createAccountRegistrationStore(
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
      };
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

      return {
        id: row.id,
        userId: row.userId,
        provider,
        providerSubject: row.providerSubject,
        ...(row.email === null ? {} : { email: row.email }),
        ...(row.phoneNumber === null ? {} : { phoneNumber: row.phoneNumber }),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      };
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

      return {
        id: row.id,
        userId: row.userId,
        role,
        ...(row.assignedByUserId === null ? {} : { assignedByUserId: row.assignedByUserId }),
        assignedAt: row.assignedAt.toISOString()
      };
    }
  };
}

function toAuthIdentityInsert(
  input: AuthIdentityInput & { readonly userId: string }
): AuthIdentitiesInsert {
  return {
    userId: input.userId,
    provider: input.provider,
    providerSubject: input.providerSubject,
    ...(input.email === undefined ? {} : { email: input.email }),
    ...(input.phoneNumber === undefined ? {} : { phoneNumber: input.phoneNumber }),
    ...(input.passwordHash === undefined ? {} : { passwordHash: input.passwordHash })
  };
}

function toRoleAssignmentInsert(input: {
  readonly userId: string;
  readonly role: CustomerPlatformRole;
  readonly assignedByUserId?: string;
}): UserRoleAssignmentsInsert {
  return {
    userId: input.userId,
    role: input.role,
    ...(input.assignedByUserId === undefined ? {} : { assignedByUserId: input.assignedByUserId })
  };
}

function isUserAccountStatus(value: string): value is UserAccountStatus {
  return userStatusSet.has(value);
}

function isIdentityProvider(value: string): value is IdentityProvider {
  return identityProviderSet.has(value);
}

function isCustomerPlatformRole(value: string): value is CustomerPlatformRole {
  return customerRoleSet.has(value);
}
