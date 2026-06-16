import { and, desc, eq, sql } from "drizzle-orm";
import type {
  AuthChallenge,
  AuthChallengeDelivery,
  AuthChallengeDeliveryStatus,
  AuthChallengeStatus,
  AuthIdentity,
  ExistingPasswordlessIdentity,
  IdentityProvider,
  PasswordlessAuthChannel,
  PasswordlessAuthStore,
  PasswordlessAuthUnitOfWork,
  UserAccount,
  UserAccountStatus,
  UserRoleAssignment
} from "@elevenhouse/domain";
import {
  authChallengeDeliveries,
  authChallengeDeliveryStatusValues,
  authChallenges,
  authChallengeStatusValues,
  authIdentities,
  databasePlatformRoleValues,
  identityProviderValues,
  userStatusValues
} from "../../../schema";
import type { ElevenHouseDatabase } from "../../../runtime";
import { insertReturningOne } from "../../../shared/insert-returning-one";
import { createAccountRegistrationStore } from "../account-registration";
import { createAuthSessionCreationStore } from "../auth-sessions";

type AuthChallengesInsert = typeof authChallenges.$inferInsert;
type AuthChallengeDeliveriesInsert = typeof authChallengeDeliveries.$inferInsert;
type AuthIdentitiesSelect = typeof authIdentities.$inferSelect;
type CustomerPlatformRole = Extract<
  (typeof databasePlatformRoleValues)[number],
  "client" | "astrologer"
>;

export type PasswordlessAuthDrizzleExecutor = Pick<
  ElevenHouseDatabase,
  "insert" | "query" | "update"
>;
export type PasswordlessAuthDrizzleDatabase = Pick<ElevenHouseDatabase, "transaction">;

const passwordlessAuthChannelSet = new Set<string>(["email", "phone"]);
const authChallengeStatusSet = new Set<string>(authChallengeStatusValues);
const authChallengeDeliveryStatusSet = new Set<string>(authChallengeDeliveryStatusValues);
const identityProviderSet = new Set<string>(identityProviderValues);
const userStatusSet = new Set<string>(userStatusValues);
const customerRoleSet = new Set<string>(["client", "astrologer"]);

export function createDrizzlePasswordlessAuthUnitOfWork(
  database: PasswordlessAuthDrizzleDatabase
): PasswordlessAuthUnitOfWork {
  return {
    transact: (operation) =>
      database.transaction((executor) => operation(createPasswordlessAuthStore(executor)))
  };
}

export function createPasswordlessAuthStore(
  executor: PasswordlessAuthDrizzleExecutor
): PasswordlessAuthStore {
  const accountRegistrationStore = createAccountRegistrationStore(executor);
  const authSessionCreationStore = createAuthSessionCreationStore(executor);

  return {
    ...accountRegistrationStore,
    ...authSessionCreationStore,
    createChallenge: async (input) => {
      const row = await insertReturningOne(
        () => executor.insert(authChallenges).values(toAuthChallengeInsert(input)).returning(),
        "auth_challenges"
      );

      return toAuthChallenge(row);
    },
    recordDelivery: async (input) => {
      const row = await insertReturningOne(
        () =>
          executor
            .insert(authChallengeDeliveries)
            .values(toAuthChallengeDeliveryInsert(input))
            .returning(),
        "auth_challenge_deliveries"
      );

      return toAuthChallengeDelivery(row);
    },
    cancelChallenge: async (input) => {
      const cancelledAt = new Date(input.cancelledAt);
      await executor
        .update(authChallenges)
        .set({
          status: "cancelled",
          cancelledAt,
          updatedAt: cancelledAt
        })
        .where(eq(authChallenges.id, input.challengeId));
    },
    findPendingChallengeByIdentifier: async (input) => {
      const row = await executor.query.authChallenges.findFirst({
        where: and(
          eq(authChallenges.channel, input.channel),
          eq(authChallenges.identifierNormalized, input.identifierNormalized),
          eq(authChallenges.status, "pending")
        ),
        orderBy: [desc(authChallenges.createdAt)]
      });

      return row ? toAuthChallenge(row) : null;
    },
    findChallengeById: async (challengeId) => {
      const row = await executor.query.authChallenges.findFirst({
        where: eq(authChallenges.id, challengeId)
      });

      return row ? toAuthChallenge(row) : null;
    },
    incrementChallengeAttempts: async (input) => {
      await executor
        .update(authChallenges)
        .set({
          attempts: sql`${authChallenges.attempts} + 1`,
          updatedAt: new Date(input.attemptedAt)
        })
        .where(eq(authChallenges.id, input.challengeId));
    },
    consumeChallenge: async (input) => {
      const consumedAt = new Date(input.consumedAt);
      await executor
        .update(authChallenges)
        .set({
          status: "consumed",
          consumedAt,
          updatedAt: consumedAt
        })
        .where(eq(authChallenges.id, input.challengeId));
    },
    findAuthIdentityByProviderSubject: async (input) => {
      const row = await executor.query.authIdentities.findFirst({
        where: and(
          eq(authIdentities.provider, input.provider),
          eq(authIdentities.providerSubject, input.providerSubject)
        ),
        with: {
          user: {
            with: {
              roleAssignments: true
            }
          }
        }
      });

      return row ? toExistingPasswordlessIdentity(row) : null;
    }
  };
}

function toAuthChallengeInsert(
  input: Parameters<PasswordlessAuthStore["createChallenge"]>[0]
): AuthChallengesInsert {
  return {
    channel: input.channel,
    identifier: input.identifier,
    identifierNormalized: input.identifierNormalized,
    codeHash: input.codeHash,
    requestedRoles: [...input.requestedRoles],
    maxAttempts: input.maxAttempts,
    expiresAt: new Date(input.expiresAt),
    resendAvailableAt: new Date(input.resendAvailableAt),
    ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
    ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent })
  };
}

function toAuthChallengeDeliveryInsert(
  input: Parameters<PasswordlessAuthStore["recordDelivery"]>[0]
): AuthChallengeDeliveriesInsert {
  return {
    challengeId: input.challengeId,
    channel: input.channel,
    provider: input.provider,
    status: input.status,
    ...(input.providerMessageId === undefined
      ? {}
      : { providerMessageId: input.providerMessageId }),
    ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    ...(input.errorMessage === undefined ? {} : { errorMessage: input.errorMessage }),
    ...(input.sentAt === undefined ? {} : { sentAt: new Date(input.sentAt) })
  };
}

function toAuthChallenge(row: typeof authChallenges.$inferSelect): AuthChallenge {
  const channel = row.channel;
  if (!isPasswordlessAuthChannel(channel)) {
    throw new Error(`Unexpected auth_challenges.channel value: ${channel}`);
  }

  const status = row.status;
  if (!isAuthChallengeStatus(status)) {
    throw new Error(`Unexpected auth_challenges.status value: ${status}`);
  }

  return {
    id: row.id,
    channel,
    identifier: row.identifier,
    identifierNormalized: row.identifierNormalized,
    codeHash: row.codeHash,
    requestedRoles: toRequestedRoles(row.requestedRoles),
    status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    expiresAt: row.expiresAt.toISOString(),
    resendAvailableAt: row.resendAvailableAt.toISOString(),
    ...(row.consumedAt === null ? {} : { consumedAt: row.consumedAt.toISOString() }),
    ...(row.cancelledAt === null ? {} : { cancelledAt: row.cancelledAt.toISOString() }),
    ...(row.ipAddress === null ? {} : { ipAddress: row.ipAddress }),
    ...(row.userAgent === null ? {} : { userAgent: row.userAgent }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toAuthChallengeDelivery(
  row: typeof authChallengeDeliveries.$inferSelect
): AuthChallengeDelivery {
  const channel = row.channel;
  if (!isPasswordlessAuthChannel(channel)) {
    throw new Error(`Unexpected auth_challenge_deliveries.channel value: ${channel}`);
  }

  const status = row.status;
  if (!isAuthChallengeDeliveryStatus(status)) {
    throw new Error(`Unexpected auth_challenge_deliveries.status value: ${status}`);
  }

  return {
    id: row.id,
    challengeId: row.challengeId,
    channel,
    provider: row.provider,
    status,
    ...(row.providerMessageId === null ? {} : { providerMessageId: row.providerMessageId }),
    ...(row.errorCode === null ? {} : { errorCode: row.errorCode }),
    ...(row.errorMessage === null ? {} : { errorMessage: row.errorMessage }),
    createdAt: row.createdAt.toISOString(),
    ...(row.sentAt === null ? {} : { sentAt: row.sentAt.toISOString() })
  };
}

function toExistingPasswordlessIdentity(
  row: AuthIdentitiesSelect & {
    readonly user: {
      readonly id: string;
      readonly status: string;
      readonly createdAt: Date;
      readonly updatedAt: Date;
      readonly roleAssignments: readonly {
        readonly id: string;
        readonly userId: string;
        readonly role: string;
        readonly assignedByUserId: string | null;
        readonly assignedAt: Date;
      }[];
    };
  }
): ExistingPasswordlessIdentity {
  return {
    user: toUserAccount(row.user),
    authIdentity: toAuthIdentity(row),
    roleAssignments: row.user.roleAssignments.map(toUserRoleAssignment)
  };
}

function toAuthIdentity(row: AuthIdentitiesSelect): AuthIdentity {
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
    ...(row.emailVerifiedAt === null ? {} : { emailVerifiedAt: row.emailVerifiedAt.toISOString() }),
    ...(row.phoneVerifiedAt === null ? {} : { phoneVerifiedAt: row.phoneVerifiedAt.toISOString() }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toUserAccount(row: {
  readonly id: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): UserAccount {
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
}

function toUserRoleAssignment(row: {
  readonly id: string;
  readonly userId: string;
  readonly role: string;
  readonly assignedByUserId: string | null;
  readonly assignedAt: Date;
}): UserRoleAssignment {
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

function toRequestedRoles(value: unknown): readonly CustomerPlatformRole[] {
  if (!Array.isArray(value)) {
    throw new Error("Unexpected auth_challenges.requested_roles value");
  }

  return value.map((role) => {
    if (typeof role !== "string" || !isCustomerPlatformRole(role)) {
      throw new Error(`Unexpected auth_challenges.requested_roles role value: ${String(role)}`);
    }

    return role;
  });
}

function isPasswordlessAuthChannel(value: string): value is PasswordlessAuthChannel {
  return passwordlessAuthChannelSet.has(value);
}

function isAuthChallengeStatus(value: string): value is AuthChallengeStatus {
  return authChallengeStatusSet.has(value);
}

function isAuthChallengeDeliveryStatus(value: string): value is AuthChallengeDeliveryStatus {
  return authChallengeDeliveryStatusSet.has(value);
}

function isIdentityProvider(value: string): value is IdentityProvider {
  return identityProviderSet.has(value);
}

function isUserAccountStatus(value: string): value is UserAccountStatus {
  return userStatusSet.has(value);
}

function isCustomerPlatformRole(value: string): value is CustomerPlatformRole {
  return customerRoleSet.has(value);
}
