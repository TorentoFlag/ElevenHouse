import { and, eq } from "drizzle-orm";
import {
  type AuthSecurityEventType,
  type AuthSessionAuthenticationStore,
  type AuthSessionCreationStore,
  type AuthSessionCreationUnitOfWork,
  type AuthSessionRevocationStore,
  type AuthSessionRevocationUnitOfWork,
  type AuthSessionStatus,
  type UserAccountStatus
} from "@elevenhouse/domain";
import {
  authSecurityEvents,
  authSecurityEventTypeValues,
  authSessionStatusValues,
  databasePlatformRoleValues,
  userSessions,
  userStatusValues
} from "../../../schema";
import type { ElevenHouseDatabase } from "../../../runtime";
import { insertReturningOne } from "../../../shared/insert-returning-one";

type UserSessionsInsert = typeof userSessions.$inferInsert;
type AuthSecurityEventsInsert = typeof authSecurityEvents.$inferInsert;
type UserSessionsSelect = typeof userSessions.$inferSelect;
type AuthSecurityEventsSelect = typeof authSecurityEvents.$inferSelect;
type CustomerPlatformRole = Extract<
  (typeof databasePlatformRoleValues)[number],
  "client" | "astrologer"
>;

export type AuthSessionCreationDrizzleExecutor = Pick<ElevenHouseDatabase, "insert">;
export type AuthSessionCreationDrizzleDatabase = Pick<ElevenHouseDatabase, "transaction">;
export type AuthSessionAuthenticationDrizzleDatabase = Pick<ElevenHouseDatabase, "query">;
export type AuthSessionRevocationDrizzleExecutor = Pick<
  ElevenHouseDatabase,
  "insert" | "query" | "update"
>;
export type AuthSessionRevocationDrizzleDatabase = Pick<ElevenHouseDatabase, "transaction">;

const authSessionStatusSet = new Set<string>(authSessionStatusValues);
const authSecurityEventTypeSet = new Set<string>(authSecurityEventTypeValues);
const userStatusSet = new Set<string>(userStatusValues);
const customerRoleSet = new Set<string>(["client", "astrologer"]);

export function createDrizzleAuthSessionCreationUnitOfWork(
  database: AuthSessionCreationDrizzleDatabase
): AuthSessionCreationUnitOfWork {
  return {
    transact: (operation) =>
      database.transaction((executor) => operation(createAuthSessionCreationStore(executor)))
  };
}

export function createDrizzleAuthSessionAuthenticationStore(
  database: AuthSessionAuthenticationDrizzleDatabase
): AuthSessionAuthenticationStore {
  return {
    findByTokenHash: (tokenHash) => findSessionByTokenHash(database, tokenHash)
  };
}

export function createDrizzleAuthSessionRevocationUnitOfWork(
  database: AuthSessionRevocationDrizzleDatabase
): AuthSessionRevocationUnitOfWork {
  return {
    transact: (operation) =>
      database.transaction((executor) => operation(createAuthSessionRevocationStore(executor)))
  };
}

export function createAuthSessionCreationStore(
  executor: AuthSessionCreationDrizzleExecutor
): AuthSessionCreationStore {
  return {
    createSession: async (input) => {
      const row = await insertReturningOne(
        () => executor.insert(userSessions).values(toUserSessionInsert(input)).returning(),
        "user_sessions"
      );

      return toAuthSession(row);
    },
    recordSecurityEvent: async (input) => {
      const row = await insertReturningOne(
        () =>
          executor.insert(authSecurityEvents).values(toAuthSecurityEventInsert(input)).returning(),
        "auth_security_events"
      );

      return toAuthSecurityEvent(row);
    }
  };
}

export function createAuthSessionRevocationStore(
  executor: AuthSessionRevocationDrizzleExecutor
): AuthSessionRevocationStore {
  return {
    findByTokenHash: (tokenHash) => findSessionByTokenHash(executor, tokenHash),
    revokeSession: async (input) => {
      const revokedAt = new Date(input.revokedAt);

      await executor
        .update(userSessions)
        .set({
          status: "revoked",
          revokedAt
        })
        .where(and(eq(userSessions.id, input.sessionId), eq(userSessions.status, "active")))
        .returning({ id: userSessions.id });
    },
    recordSecurityEvent: async (input) => {
      const row = await insertReturningOne(
        () =>
          executor.insert(authSecurityEvents).values(toAuthSecurityEventInsert(input)).returning(),
        "auth_security_events"
      );

      return toAuthSecurityEvent(row);
    }
  };
}

async function findSessionByTokenHash(
  database: AuthSessionAuthenticationDrizzleDatabase,
  tokenHash: string
) {
  const row = await database.query.userSessions.findFirst({
    where: eq(userSessions.tokenHash, tokenHash),
    with: {
      user: {
        with: {
          roleAssignments: true
        }
      }
    }
  });

  if (!row) {
    return null;
  }

  return {
    session: toAuthSession(row),
    user: toUserAccount(row.user),
    roleAssignments: row.user.roleAssignments
      .filter((assignment) => isCustomerPlatformRole(assignment.role))
      .map(toUserRoleAssignment)
  };
}

function toUserSessionInsert(
  input: Parameters<AuthSessionCreationStore["createSession"]>[0]
): UserSessionsInsert {
  return {
    userId: input.userId,
    tokenHash: input.tokenHash,
    createdAt: new Date(input.createdAt),
    expiresAt: new Date(input.expiresAt),
    ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
    ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress })
  };
}

function toAuthSecurityEventInsert(
  input: Parameters<AuthSessionCreationStore["recordSecurityEvent"]>[0]
): AuthSecurityEventsInsert {
  return {
    eventType: input.eventType,
    occurredAt: new Date(input.occurredAt),
    ...(input.userId === undefined ? {} : { userId: input.userId }),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
    ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata })
  };
}

function toUserRoleAssignment(row: {
  readonly id: string;
  readonly userId: string;
  readonly role: string;
  readonly assignedByUserId: string | null;
  readonly assignedAt: Date;
}) {
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

function toAuthSession(row: UserSessionsSelect) {
  const status = row.status;
  if (!isAuthSessionStatus(status)) {
    throw new Error(`Unexpected user_sessions.status value: ${status}`);
  }

  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    status,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ...(row.lastSeenAt === null ? {} : { lastSeenAt: row.lastSeenAt.toISOString() }),
    ...(row.revokedAt === null ? {} : { revokedAt: row.revokedAt.toISOString() }),
    ...(row.userAgent === null ? {} : { userAgent: row.userAgent }),
    ...(row.ipAddress === null ? {} : { ipAddress: row.ipAddress })
  };
}

function toAuthSecurityEvent(row: AuthSecurityEventsSelect) {
  const eventType = row.eventType;
  if (!isAuthSecurityEventType(eventType)) {
    throw new Error(`Unexpected auth_security_events.event_type value: ${eventType}`);
  }

  return {
    id: row.id,
    eventType,
    occurredAt: row.occurredAt.toISOString(),
    ...(row.userId === null ? {} : { userId: row.userId }),
    ...(row.sessionId === null ? {} : { sessionId: row.sessionId }),
    ...(row.ipAddress === null ? {} : { ipAddress: row.ipAddress }),
    ...(row.userAgent === null ? {} : { userAgent: row.userAgent }),
    metadata: toAuthSecurityEventMetadata(row.metadata)
  };
}

function toAuthSecurityEventMetadata(
  value: unknown
): Record<string, string | number | boolean | null> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Unexpected auth_security_events.metadata value");
  }

  const metadata: Record<string, string | number | boolean | null> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean" &&
      entry !== null
    ) {
      throw new Error(`Unexpected auth_security_events.metadata entry value for ${key}`);
    }

    metadata[key] = entry;
  }

  return metadata;
}

function toUserAccount(row: {
  readonly id: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}) {
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

function isAuthSessionStatus(value: string): value is AuthSessionStatus {
  return authSessionStatusSet.has(value);
}

function isAuthSecurityEventType(value: string): value is AuthSecurityEventType {
  return authSecurityEventTypeSet.has(value);
}

function isUserAccountStatus(value: string): value is UserAccountStatus {
  return userStatusSet.has(value);
}

function isCustomerPlatformRole(value: string): value is CustomerPlatformRole {
  return customerRoleSet.has(value);
}
