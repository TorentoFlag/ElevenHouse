import { and, asc, eq, gt, inArray, lt, or } from "drizzle-orm";
import type {
  AuthenticatedMobileSessionContext,
  MobilePasswordlessLoginUnitOfWork,
  MobilePasswordlessRegistrationUnitOfWork,
  MobileRefreshToken,
  MobileSession,
  MobileSessionAuthenticationStore,
  MobileSessionCreationStore,
  MobileSessionManagementStore,
  MobileSessionPlatform,
  MobileSessionRefreshStore,
  MobileSessionRevocationStore,
  MobileSessionStatus,
  MobileSessionUnitOfWork,
  UserAccount,
  UserRoleAssignment
} from "@elevenhouse/domain";
import {
  mobileRefreshRetryReceipts,
  mobileRefreshTokens,
  mobileSessions,
  users,
  userStatusValues
} from "../../../schema";
import type { ElevenHouseDatabase } from "../../../runtime";
import { insertReturningOne } from "../../../shared/insert-returning-one";
import { createPasswordlessAuthStore } from "../passwordless-auth";
import { createAccountRegistrationStore } from "../account-registration";

type MobileSessionsInsert = typeof mobileSessions.$inferInsert;
type MobileSessionsSelect = typeof mobileSessions.$inferSelect;
type MobileRefreshTokensInsert = typeof mobileRefreshTokens.$inferInsert;
type MobileRefreshTokensSelect = typeof mobileRefreshTokens.$inferSelect;
type MobileRefreshRetryReceiptsInsert = typeof mobileRefreshRetryReceipts.$inferInsert;

export type MobileSessionDrizzleExecutor = Pick<
  ElevenHouseDatabase,
  "insert" | "query" | "select" | "update"
  | "delete"
>;
export type MobileSessionDrizzleDatabase = Pick<ElevenHouseDatabase, "transaction" | "query">;
export type MobileSessionDrizzleStore = MobileSessionCreationStore &
  MobileSessionRefreshStore &
  MobileSessionRevocationStore;

const userStatusSet = new Set<string>(userStatusValues);

export function createDrizzleMobileSessionUnitOfWork(
  database: Pick<ElevenHouseDatabase, "transaction">
): MobileSessionUnitOfWork<MobileSessionDrizzleStore> {
  return {
    transact: (operation) =>
      database.transaction((executor) => operation(createMobileSessionStore(executor)))
  };
}

export function createDrizzleMobilePasswordlessLoginUnitOfWork(
  database: Pick<ElevenHouseDatabase, "transaction">
): MobilePasswordlessLoginUnitOfWork {
  return {
    transact: (operation) =>
      database.transaction((executor) => {
        const passwordless = createPasswordlessAuthStore(executor);
        const mobile = createMobileSessionStore(executor);
        return operation({
          ...passwordless,
          createMobileSession: mobile.createMobileSession
        });
      })
  };
}

export function createDrizzleMobilePasswordlessRegistrationUnitOfWork(
  database: Pick<ElevenHouseDatabase, "transaction">
): MobilePasswordlessRegistrationUnitOfWork {
  return {
    transact: (operation) =>
      database.transaction((executor) => {
        const passwordless = createPasswordlessAuthStore(executor);
        const registration = createAccountRegistrationStore(executor);
        const mobile = createMobileSessionStore(executor);
        return operation({
          ...passwordless,
          ...registration,
          createMobileSession: mobile.createMobileSession
        });
      })
  };
}

export function createDrizzleMobileSessionAuthenticationStore(
  database: Pick<ElevenHouseDatabase, "query">
): MobileSessionAuthenticationStore {
  return {
    findByAccessTokenHash: (tokenHash) => findAuthenticatedMobileSession(database, tokenHash)
  };
}

export function createDrizzleMobileSessionManagementStore(
  database: Pick<ElevenHouseDatabase, "query">
): MobileSessionManagementStore {
  return {
    listActiveSessionsForUser: async ({ userId, now }) => {
      const rows = await database.query.mobileSessions.findMany({
        where: and(
          eq(mobileSessions.userId, userId),
          eq(mobileSessions.status, "active"),
          gt(mobileSessions.expiresAt, new Date(now))
        ),
        orderBy: (sessions, { desc }) => [desc(sessions.lastUsedAt)]
      });
      return rows.map(toMobileSession);
    }
  };
}

export function createMobileSessionStore(
  executor: MobileSessionDrizzleExecutor
): MobileSessionDrizzleStore {
  const passwordless = createPasswordlessAuthStore(executor);
  return {
    purgeExpiredArtifacts: async ({ now }) => {
      const cutoff = new Date(now);
      await executor
        .delete(mobileRefreshRetryReceipts)
        .where(lt(mobileRefreshRetryReceipts.expiresAt, cutoff));
      await executor
        .delete(mobileRefreshTokens)
        .where(
          and(
            lt(mobileRefreshTokens.expiresAt, cutoff),
            or(
              eq(mobileRefreshTokens.status, "consumed"),
              eq(mobileRefreshTokens.status, "revoked")
            )
          )
        );
    },
    createMobileSession: async (input) => {
      if (!(await lockUserForUpdate(executor, input.userId))) {
        throw new Error(`Mobile session user not found: ${input.userId}`);
      }
      const session = await insertReturningOne(
        () => executor.insert(mobileSessions).values(toMobileSessionInsert(input)).returning(),
        "mobile_sessions"
      );
      await insertReturningOne(
        () =>
          executor
            .insert(mobileRefreshTokens)
            .values(
              toMobileRefreshTokenInsert({
                sessionId: session.id,
                tokenHash: input.refreshTokenHash,
                createdAt: input.createdAt,
                expiresAt: input.expiresAt
              })
            )
            .returning(),
        "mobile_refresh_tokens"
      );
      return toMobileSession(session);
    },
    lockRefreshFamilyByTokenHash: (tokenHash) => lockRefreshFamilyByTokenHash(executor, tokenHash),
    findRefreshRetryReceipt: async ({ refreshTokenId, operationId, now }) => {
      const receipt = await executor.query.mobileRefreshRetryReceipts.findFirst({
        where: and(
          eq(mobileRefreshRetryReceipts.refreshTokenId, refreshTokenId),
          eq(mobileRefreshRetryReceipts.operationId, operationId),
          gt(mobileRefreshRetryReceipts.expiresAt, new Date(now))
        ),
        columns: { encryptedTokenPair: true }
      });
      return receipt ?? null;
    },
    createRefreshRetryReceipt: async (input) => {
      await insertReturningOne(
        () =>
          executor
            .insert(mobileRefreshRetryReceipts)
            .values(toMobileRefreshRetryReceiptInsert(input))
            .returning(),
        "mobile_refresh_retry_receipts"
      );
    },
    recordSecurityEvent: passwordless.recordSecurityEvent,
    consumeRefreshToken: async ({ refreshTokenId, consumedAt }) => {
      const rows = await executor
        .update(mobileRefreshTokens)
        .set({ status: "consumed", consumedAt: new Date(consumedAt) })
        .where(
          and(eq(mobileRefreshTokens.id, refreshTokenId), eq(mobileRefreshTokens.status, "active"))
        )
        .returning({ id: mobileRefreshTokens.id });
      return rows.length === 1;
    },
    rotateSession: async (input) => {
      const rows = await executor
        .update(mobileSessions)
        .set({
          accessTokenHash: input.accessTokenHash,
          accessTokenExpiresAt: new Date(input.accessTokenExpiresAt),
          lastUsedAt: new Date(input.lastUsedAt),
          expiresAt: new Date(input.expiresAt)
        })
        .where(and(eq(mobileSessions.id, input.sessionId), eq(mobileSessions.status, "active")))
        .returning({ id: mobileSessions.id });
      if (rows.length !== 1) return false;
      await insertReturningOne(
        () =>
          executor
            .insert(mobileRefreshTokens)
            .values(
              toMobileRefreshTokenInsert({
                sessionId: input.sessionId,
                tokenHash: input.refreshTokenHash,
                createdAt: input.lastUsedAt,
                expiresAt: input.expiresAt
              })
            )
            .returning(),
        "mobile_refresh_tokens"
      );
      return true;
    },
    revokeSession: async (input) => {
      const candidate = await executor.query.mobileSessions.findFirst({
        where: eq(mobileSessions.id, input.sessionId),
        columns: { id: true, userId: true }
      });
      if (!candidate || !(await lockUserForUpdate(executor, candidate.userId))) return;
      const [session] = await executor
        .select({ id: mobileSessions.id, status: mobileSessions.status })
        .from(mobileSessions)
        .where(eq(mobileSessions.id, input.sessionId))
        .limit(1)
        .for("update");
      if (!session || session.status !== "active") return;
      await executor
        .select({ id: mobileRefreshTokens.id })
        .from(mobileRefreshTokens)
        .where(
          and(
            eq(mobileRefreshTokens.sessionId, input.sessionId),
            eq(mobileRefreshTokens.status, "active")
          )
        )
        .orderBy(asc(mobileRefreshTokens.id))
        .for("update");
      await executor
        .update(mobileSessions)
        .set({
          status: "revoked",
          revokedAt: new Date(input.revokedAt),
          revokedReason: input.revokedReason
        })
        .where(and(eq(mobileSessions.id, input.sessionId), eq(mobileSessions.status, "active")));
      await executor
        .update(mobileRefreshTokens)
        .set({ status: "revoked" })
        .where(
          and(
            eq(mobileRefreshTokens.sessionId, input.sessionId),
            eq(mobileRefreshTokens.status, "active")
          )
        );
    },
    revokeAllSessionsForUser: async (input) => {
      if (!(await lockUserForUpdate(executor, input.userId))) return;
      const activeSessions = await executor
        .select({ id: mobileSessions.id })
        .from(mobileSessions)
        .where(and(eq(mobileSessions.userId, input.userId), eq(mobileSessions.status, "active")))
        .orderBy(asc(mobileSessions.id))
        .for("update");
      if (activeSessions.length === 0) return;
      const ids = activeSessions.map((session) => session.id);
      await executor
        .select({ id: mobileRefreshTokens.id })
        .from(mobileRefreshTokens)
        .where(
          and(inArray(mobileRefreshTokens.sessionId, ids), eq(mobileRefreshTokens.status, "active"))
        )
        .orderBy(asc(mobileRefreshTokens.sessionId), asc(mobileRefreshTokens.id))
        .for("update");
      await executor
        .update(mobileSessions)
        .set({
          status: "revoked",
          revokedAt: new Date(input.revokedAt),
          revokedReason: input.revokedReason
        })
        .where(and(inArray(mobileSessions.id, ids), eq(mobileSessions.status, "active")));
      await executor
        .update(mobileRefreshTokens)
        .set({ status: "revoked" })
        .where(
          and(inArray(mobileRefreshTokens.sessionId, ids), eq(mobileRefreshTokens.status, "active"))
        );
    }
  };
}

function toMobileRefreshRetryReceiptInsert(
  input: Parameters<MobileSessionRefreshStore["createRefreshRetryReceipt"]>[0]
): MobileRefreshRetryReceiptsInsert {
  return {
    refreshTokenId: input.refreshTokenId,
    operationId: input.operationId,
    encryptedTokenPair: input.encryptedTokenPair,
    createdAt: new Date(input.createdAt),
    expiresAt: new Date(input.expiresAt)
  };
}

async function lockRefreshFamilyByTokenHash(
  executor: MobileSessionDrizzleExecutor,
  tokenHash: string
): Promise<{
  readonly refreshToken: MobileRefreshToken;
  readonly session: MobileSession;
} | null> {
  const candidateRefresh = await executor.query.mobileRefreshTokens.findFirst({
    where: eq(mobileRefreshTokens.tokenHash, tokenHash),
    columns: { id: true, sessionId: true }
  });
  if (!candidateRefresh) return null;
  const candidateSession = await executor.query.mobileSessions.findFirst({
    where: eq(mobileSessions.id, candidateRefresh.sessionId),
    columns: { id: true, userId: true }
  });
  if (!candidateSession || !(await lockUserForUpdate(executor, candidateSession.userId))) {
    return null;
  }

  const [session] = await executor
    .select()
    .from(mobileSessions)
    .where(eq(mobileSessions.id, candidateSession.id))
    .limit(1)
    .for("update");
  if (!session) return null;
  const [refreshToken] = await executor
    .select()
    .from(mobileRefreshTokens)
    .where(
      and(
        eq(mobileRefreshTokens.id, candidateRefresh.id),
        eq(mobileRefreshTokens.sessionId, session.id),
        eq(mobileRefreshTokens.tokenHash, tokenHash)
      )
    )
    .limit(1)
    .for("update");
  if (!refreshToken) return null;

  return {
    session: toMobileSession(session),
    refreshToken: toMobileRefreshToken(refreshToken)
  };
}

async function lockUserForUpdate(
  executor: MobileSessionDrizzleExecutor,
  userId: string
): Promise<boolean> {
  const rows = await executor
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .for("update");
  return rows.length === 1;
}

async function findAuthenticatedMobileSession(
  database: Pick<ElevenHouseDatabase, "query">,
  tokenHash: string
): Promise<AuthenticatedMobileSessionContext | null> {
  const row = await database.query.mobileSessions.findFirst({
    where: eq(mobileSessions.accessTokenHash, tokenHash),
    with: { user: { with: { roleAssignments: true } } }
  });
  if (!row) return null;
  return {
    session: toMobileSession(row),
    user: toUserAccount(row.user),
    roleAssignments: row.user.roleAssignments.map(toUserRoleAssignment)
  };
}

function toMobileSessionInsert(
  input: Parameters<MobileSessionCreationStore["createMobileSession"]>[0]
): MobileSessionsInsert {
  return {
    userId: input.userId,
    platform: input.platform,
    deviceLabel: input.deviceLabel,
    accessTokenHash: input.accessTokenHash,
    accessTokenExpiresAt: new Date(input.accessTokenExpiresAt),
    createdAt: new Date(input.createdAt),
    lastUsedAt: new Date(input.createdAt),
    expiresAt: new Date(input.expiresAt)
  };
}

function toMobileRefreshTokenInsert(input: {
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}): MobileRefreshTokensInsert {
  return {
    sessionId: input.sessionId,
    tokenHash: input.tokenHash,
    createdAt: new Date(input.createdAt),
    expiresAt: new Date(input.expiresAt)
  };
}

function toMobileSession(row: MobileSessionsSelect): MobileSession {
  if (row.platform !== "ios" && row.platform !== "android") {
    throw new Error(`Unexpected mobile_sessions.platform value: ${row.platform}`);
  }
  if (row.status !== "active" && row.status !== "revoked") {
    throw new Error(`Unexpected mobile_sessions.status value: ${row.status}`);
  }
  return {
    id: row.id,
    userId: row.userId,
    platform: row.platform as MobileSessionPlatform,
    deviceLabel: row.deviceLabel,
    status: row.status as MobileSessionStatus,
    accessTokenHash: row.accessTokenHash,
    accessTokenExpiresAt: row.accessTokenExpiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ...(row.revokedAt === null ? {} : { revokedAt: row.revokedAt.toISOString() }),
    ...(row.revokedReason === null ? {} : { revokedReason: row.revokedReason })
  };
}

function toMobileRefreshToken(row: MobileRefreshTokensSelect): MobileRefreshToken {
  if (row.status !== "active" && row.status !== "consumed" && row.status !== "revoked") {
    throw new Error(`Unexpected mobile_refresh_tokens.status value: ${row.status}`);
  }
  return {
    id: row.id,
    sessionId: row.sessionId,
    tokenHash: row.tokenHash,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ...(row.consumedAt === null ? {} : { consumedAt: row.consumedAt.toISOString() })
  };
}

function toUserAccount(row: {
  readonly id: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): UserAccount {
  if (!userStatusSet.has(row.status))
    throw new Error(`Unexpected users.status value: ${row.status}`);
  return {
    id: row.id,
    status: row.status as UserAccount["status"],
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
  return {
    id: row.id,
    userId: row.userId,
    role: row.role as UserRoleAssignment["role"],
    ...(row.assignedByUserId === null ? {} : { assignedByUserId: row.assignedByUserId }),
    assignedAt: row.assignedAt.toISOString()
  };
}
