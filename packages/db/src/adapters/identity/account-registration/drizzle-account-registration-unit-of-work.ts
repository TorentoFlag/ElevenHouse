import {
  CustomerAccountIdentityConflictError,
  type AccountRegistrationStore,
  type AccountRegistrationUnitOfWork,
  type AuthIdentityInput,
  type IdentityProvider,
  type UserAccountStatus
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
const authIdentityUniqueConstraints = new Set<string>([
  "auth_identities_provider_subject_unique",
  "auth_identities_email_login_unique",
  "auth_identities_phone_login_unique"
]);

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
      const row = await createAuthIdentityRow(executor, input);

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
        ...(row.emailVerifiedAt === null
          ? {}
          : { emailVerifiedAt: row.emailVerifiedAt.toISOString() }),
        ...(row.phoneVerifiedAt === null
          ? {}
          : { phoneVerifiedAt: row.phoneVerifiedAt.toISOString() }),
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

async function createAuthIdentityRow(
  executor: AccountRegistrationDrizzleExecutor,
  input: AuthIdentityInput & { readonly userId: string }
): Promise<typeof authIdentities.$inferSelect> {
  try {
    return await insertReturningOne(
      () => executor.insert(authIdentities).values(toAuthIdentityInsert(input)).returning(),
      "auth_identities"
    );
  } catch (error) {
    if (isAuthIdentityUniqueViolation(error)) {
      throw new CustomerAccountIdentityConflictError();
    }

    throw error;
  }
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
    ...(input.emailVerifiedAt === undefined
      ? {}
      : { emailVerifiedAt: new Date(input.emailVerifiedAt) }),
    ...(input.phoneVerifiedAt === undefined
      ? {}
      : { phoneVerifiedAt: new Date(input.phoneVerifiedAt) })
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

function isAuthIdentityUniqueViolation(error: unknown): boolean {
  if (!isPostgresError(error)) {
    return false;
  }

  return error.code === "23505" && authIdentityUniqueConstraints.has(error.constraint);
}

function isPostgresError(error: unknown): error is {
  readonly code: string;
  readonly constraint: string;
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "constraint" in error &&
    typeof error.code === "string" &&
    typeof error.constraint === "string"
  );
}
