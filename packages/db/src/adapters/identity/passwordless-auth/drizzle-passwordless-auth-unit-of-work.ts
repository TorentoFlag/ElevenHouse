import { and, desc, eq, sql } from "drizzle-orm";
import {
  authCodeDeliveryRequestedEventType,
  PasswordlessCodeRequestCooldownError,
  PasswordlessCodeVerificationError
} from "@elevenhouse/domain";
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
  authChallengeDeliveries
} from "../../../schema/identity/auth-challenge-deliveries.schema";
import {
  authChallenges
} from "../../../schema/identity/auth-challenges.schema";
import {
  authIdentities
} from "../../../schema/identity/auth-identities.schema";
import {
  authChallengeDeliveryStatusValues,
  authChallengeStatusValues,
  databasePlatformRoleValues,
  identityProviderValues,
  userStatusValues
} from "../../../schema/identity/identity-schema-values";
import { outboxEvents } from "../../../schema/outbox/outbox-events.schema";
import type { ElevenHouseDatabase } from "../../../runtime";
import { insertReturningOne } from "../../../shared/insert-returning-one";
import { createAuthSessionCreationStore } from "../auth-sessions";

type AuthChallengesInsert = typeof authChallenges.$inferInsert;
type AuthChallengeDeliveriesInsert = typeof authChallengeDeliveries.$inferInsert;
type OutboxEventsInsert = typeof outboxEvents.$inferInsert;
type AuthIdentitiesSelect = typeof authIdentities.$inferSelect;
type CustomerPlatformRole = Extract<
  (typeof databasePlatformRoleValues)[number],
  "client" | "astrologer"
>;

export type PasswordlessAuthDrizzleExecutor = Pick<
  ElevenHouseDatabase,
  "insert" | "query" | "select" | "update"
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
  const authSessionCreationStore = createAuthSessionCreationStore(executor);

  return {
    ...authSessionCreationStore,
    createChallenge: async (input) => {
      let row: typeof authChallenges.$inferSelect;

      try {
        row = await insertReturningOne(
          () => executor.insert(authChallenges).values(toAuthChallengeInsert(input)).returning(),
          "auth_challenges"
        );
      } catch (error) {
        if (isPendingChallengeUniqueViolation(error)) {
          const pendingChallenge = await findPendingChallengeByIdentifier(executor, {
            channel: input.channel,
            identifierNormalized: input.identifierNormalized
          });

          if (pendingChallenge) {
            throw new PasswordlessCodeRequestCooldownError(pendingChallenge.resendAvailableAt);
          }
        }

        throw error;
      }

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
    recordAuthCodeDeliveryRequested: async (input) => {
      await executor
        .insert(outboxEvents)
        .values(toAuthCodeDeliveryRequestedOutboxInsert(input))
        .returning({ id: outboxEvents.id });
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
      return findPendingChallengeByIdentifier(executor, input);
    },
    findLatestDeliveryByChallengeId: async (challengeId) => {
      return findLatestDeliveryByChallengeId(executor, challengeId);
    },
    findChallengeById: async (challengeId) => {
      const row = await executor.query.authChallenges.findFirst({
        where: eq(authChallenges.id, challengeId)
      });

      return row ? toAuthChallenge(row) : null;
    },
    incrementChallengeAttempts: async (input) => {
      const rows = await executor
        .update(authChallenges)
        .set({
          attempts: sql`${authChallenges.attempts} + 1`,
          updatedAt: new Date(input.attemptedAt)
        })
        .where(
          and(
            eq(authChallenges.id, input.challengeId),
            eq(authChallenges.status, "pending"),
            sql`${authChallenges.attempts} < ${authChallenges.maxAttempts}`
          )
        )
        .returning({ id: authChallenges.id });

      if (!rows[0]) {
        throw new PasswordlessCodeVerificationError();
      }
    },
    consumeChallenge: async (input) => {
      const consumedAt = new Date(input.consumedAt);
      const rows = await executor
        .update(authChallenges)
        .set({
          status: "consumed",
          consumedAt,
          updatedAt: consumedAt
        })
        .where(and(eq(authChallenges.id, input.challengeId), eq(authChallenges.status, "pending")))
        .returning({ id: authChallenges.id });

      if (!rows[0]) {
        throw new PasswordlessCodeVerificationError();
      }
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

async function findPendingChallengeByIdentifier(
  executor: PasswordlessAuthDrizzleExecutor,
  input: {
    readonly channel: PasswordlessAuthChannel;
    readonly identifierNormalized: string;
  }
): Promise<AuthChallenge | null> {
  const rows = await executor
    .select()
    .from(authChallenges)
    .where(
      and(
        eq(authChallenges.channel, input.channel),
        eq(authChallenges.identifierNormalized, input.identifierNormalized),
        eq(authChallenges.status, "pending")
      )
    )
    .orderBy(desc(authChallenges.createdAt))
    .limit(1);
  const row = rows[0];

  return row ? toAuthChallenge(row) : null;
}

async function findLatestDeliveryByChallengeId(
  executor: PasswordlessAuthDrizzleExecutor,
  challengeId: string
): Promise<AuthChallengeDelivery | null> {
  const rows = await executor
    .select()
    .from(authChallengeDeliveries)
    .where(eq(authChallengeDeliveries.challengeId, challengeId))
    .orderBy(desc(authChallengeDeliveries.createdAt))
    .limit(1);
  const row = rows[0];

  return row ? toAuthChallengeDelivery(row) : null;
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

function toAuthCodeDeliveryRequestedOutboxInsert(
  input: Parameters<PasswordlessAuthStore["recordAuthCodeDeliveryRequested"]>[0]
): OutboxEventsInsert {
  return {
    eventType: authCodeDeliveryRequestedEventType,
    aggregateId: input.payload.deliveryId,
    payload: input.payload,
    availableAt: new Date(input.occurredAt)
  };
}

function toAuthChallengeDeliveryInsert(
  input: Parameters<PasswordlessAuthStore["recordDelivery"]>[0]
): AuthChallengeDeliveriesInsert {
  return {
    challengeId: input.challengeId,
    status: input.status,
    ...(input.provider === undefined ? {} : { provider: input.provider }),
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
  const status = row.status;
  if (!isAuthChallengeDeliveryStatus(status)) {
    throw new Error(`Unexpected auth_challenge_deliveries.status value: ${status}`);
  }

  return {
    id: row.id,
    challengeId: row.challengeId,
    status,
    ...(row.provider === null ? {} : { provider: row.provider }),
    ...(row.providerMessageId === null ? {} : { providerMessageId: row.providerMessageId }),
    ...(row.errorCode === null ? {} : { errorCode: row.errorCode }),
    ...(row.errorMessage === null ? {} : { errorMessage: row.errorMessage }),
    createdAt: row.createdAt.toISOString(),
    ...(row.sentAt === null ? {} : { sentAt: row.sentAt.toISOString() })
  };
}

function isPendingChallengeUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const databaseError = error as {
    readonly code?: unknown;
    readonly constraint?: unknown;
  };

  return (
    databaseError.code === "23505" &&
    databaseError.constraint === "auth_challenges_pending_identifier_unique"
  );
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
