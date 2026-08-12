import { randomUUID } from "node:crypto";

import { hashSessionToken } from "@elevenhouse/auth";
import {
  createMobileSession,
  hashPasswordlessCode,
  refreshMobileSession,
  revokeAllMobileSessions,
  revokeMobileSession,
  verifyMobilePasswordlessLogin
} from "@elevenhouse/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../../runtime";
import { readCurrentMigrationSql } from "../../../testing/current-migration-sql";
import {
  createDrizzleMobilePasswordlessLoginUnitOfWork,
  createDrizzleMobileSessionManagementStore,
  createDrizzleMobileSessionUnitOfWork
} from "./drizzle-mobile-session-unit-of-work";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_mobile_sessions_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const firstNow = new Date("2026-08-12T10:00:00.000Z");

describe.sequential("mobile session Drizzle/PostgreSQL integrity", () => {
  const admin = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    await pool.query(readCurrentMigrationSql());
    runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
  }, 60_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await pool?.end();
      await admin.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await admin.end();
    }
  }, 30_000);

  it("rejects an active family without exactly one exact-expiry active refresh token", async () => {
    const userId = await seedAstrologer();

    await expect(
      pool.query(
        `insert into mobile_sessions
         (user_id, platform, device_label, access_token_hash, access_token_expires_at,
          created_at, last_used_at, expires_at)
         values ($1, 'ios', 'No Refresh', $2, $3, $4, $4, $5)`,
        [
          userId,
          hashSessionToken("orphan-access"),
          "2026-08-12T10:15:00.000Z",
          firstNow,
          "2026-09-12T10:00:00.000Z"
        ]
      )
    ).rejects.toMatchObject({
      code: "23514",
      message: expect.stringContaining("exactly one active refresh token")
    });

    const client = await pool.connect();
    try {
      await client.query("begin");
      const sessionId = randomUUID();
      await client.query(
        `insert into mobile_sessions
         (id, user_id, platform, device_label, access_token_hash, access_token_expires_at,
          created_at, last_used_at, expires_at)
         values ($1, $2, 'ios', 'Wrong Expiry', $3, $4, $5, $5, $6)`,
        [
          sessionId,
          userId,
          hashSessionToken("wrong-expiry-access"),
          "2026-08-12T10:15:00.000Z",
          firstNow,
          "2026-09-12T10:00:00.000Z"
        ]
      );
      await client.query(
        `insert into mobile_refresh_tokens
         (session_id, token_hash, created_at, expires_at)
         values ($1, $2, $3, $4)`,
        [sessionId, hashSessionToken("wrong-expiry-refresh"), firstNow, "2026-09-11T10:00:00.000Z"]
      );
      await expect(client.query("commit")).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("expiry is outside")
      });
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });

  it("permits only active-to-revoked session and active-to-terminal refresh transitions", async () => {
    const userId = await seedAstrologer();
    const created = await createSession(userId, "Lifecycle iPhone", firstNow);

    await expect(
      pool.query(
        `update mobile_sessions
         set status = 'revoked', revoked_at = $2, revoked_reason = 'direct_invalid'
         where id = $1`,
        [created.session.id, firstNow]
      )
    ).rejects.toMatchObject({
      code: "23514",
      message: expect.stringContaining("cannot have an active refresh token")
    });

    await revokeMobileSession({
      sessions: createDrizzleMobileSessionUnitOfWork(runtime.database),
      sessionId: created.session.id,
      now: firstNow,
      reason: "logout"
    });

    await expect(
      pool.query(
        `update mobile_sessions
         set status = 'active', revoked_at = null, revoked_reason = null
         where id = $1`,
        [created.session.id]
      )
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("immutable") });
    await expect(
      pool.query(
        `update mobile_refresh_tokens set status = 'active'
         where session_id = $1`,
        [created.session.id]
      )
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("transition") });
  });

  it("serializes two refreshes without deadlock and ends the replayed family revoked", async () => {
    const userId = await seedAstrologer();
    const created = await createSession(userId, "Double Refresh", firstNow);
    const sessions = createDrizzleMobileSessionUnitOfWork(runtime.database);

    const results = await withTimeout(
      Promise.all([
        refreshMobileSession({
          sessions,
          tokenIssuer: tokenIssuer("double-a"),
          refreshTokenHash: hashSessionToken(created.refreshToken),
          operationId: "5a14390f-3db1-4d1c-9344-55679c778427",
          retryReceiptCipher: retryReceiptCipher(),
          now: new Date("2026-08-12T10:01:00.000Z"),
          accessTokenTtlSeconds: 900,
          idleTtlSeconds: 15_552_000
        }),
        refreshMobileSession({
          sessions,
          tokenIssuer: tokenIssuer("double-b"),
          refreshTokenHash: hashSessionToken(created.refreshToken),
          operationId: "6a14390f-3db1-4d1c-9344-55679c778427",
          retryReceiptCipher: retryReceiptCipher(),
          now: new Date("2026-08-12T10:01:00.000Z"),
          accessTokenTtlSeconds: 900,
          idleTtlSeconds: 15_552_000
        })
      ]),
      10_000
    );

    expect(results.map((result) => result.kind).sort()).toEqual(["refreshed", "reused"]);
    await expect(readFamily(created.session.id)).resolves.toEqual({
      sessionStatus: "revoked",
      activeRefreshCount: 0,
      refreshStatuses: ["consumed", "revoked"]
    });
  });

  it("serializes refresh against logout without deadlock and leaves one terminal family", async () => {
    const userId = await seedAstrologer();
    const created = await createSession(userId, "Refresh Logout", firstNow);
    const sessions = createDrizzleMobileSessionUnitOfWork(runtime.database);

    const [refreshResult] = await withTimeout(
      Promise.all([
        refreshMobileSession({
          sessions,
          tokenIssuer: tokenIssuer("logout-race"),
          refreshTokenHash: hashSessionToken(created.refreshToken),
          operationId: "7a14390f-3db1-4d1c-9344-55679c778427",
          retryReceiptCipher: retryReceiptCipher(),
          now: new Date("2026-08-12T10:01:00.000Z"),
          accessTokenTtlSeconds: 900,
          idleTtlSeconds: 15_552_000
        }),
        revokeMobileSession({
          sessions,
          sessionId: created.session.id,
          now: new Date("2026-08-12T10:01:00.000Z"),
          reason: "logout"
        })
      ]),
      10_000
    );

    expect(["refreshed", "invalid"]).toContain(refreshResult.kind);
    const family = await readFamily(created.session.id);
    expect(family.sessionStatus).toBe("revoked");
    expect(family.activeRefreshCount).toBe(0);
  });

  it("serializes create and logout-all by user and omits expired active rows from management reads", async () => {
    const userId = await seedAstrologer();
    const sessions = createDrizzleMobileSessionUnitOfWork(runtime.database);

    await withTimeout(
      Promise.all([
        createMobileSession({
          sessions,
          tokenIssuer: tokenIssuer("create-race"),
          userId,
          platform: "ios",
          deviceLabel: "Create Race",
          now: firstNow,
          accessTokenTtlSeconds: 900,
          idleTtlSeconds: 3_600
        }),
        revokeAllMobileSessions({
          sessions,
          userId,
          now: new Date("2026-08-12T10:00:01.000Z"),
          reason: "logout_all"
        })
      ]),
      10_000
    );

    const activeFamilies = await pool.query<{ invalid_count: string }>(
      `select count(*)::text as invalid_count
       from mobile_sessions session
       where session.user_id = $1
         and ((session.status = 'active' and
           (select count(*) from mobile_refresh_tokens token
            where token.session_id = session.id and token.status = 'active') <> 1)
          or (session.status = 'revoked' and
           (select count(*) from mobile_refresh_tokens token
            where token.session_id = session.id and token.status = 'active') <> 0))`,
      [userId]
    );
    expect(activeFamilies.rows[0]?.invalid_count).toBe("0");

    const visible = await createDrizzleMobileSessionManagementStore(
      runtime.database
    ).listActiveSessionsForUser({
      userId,
      now: "2026-08-12T11:00:01.000Z"
    });
    expect(visible).toEqual([]);
  });

  it("commits OTP consumption, initial family, and security event atomically and rolls all back on insert failure", async () => {
    const userId = await seedAstrologer("atomic@example.com");
    const challengeId = await seedChallenge("atomic@example.com", "123456");
    const login = createDrizzleMobilePasswordlessLoginUnitOfWork(runtime.database);

    const result = await verifyMobilePasswordlessLogin({
      login,
      tokenIssuer: tokenIssuer("atomic-success"),
      challengeId,
      code: "123456",
      codeSecret: "integration-secret",
      platform: "ios",
      deviceLabel: "Atomic iPhone",
      now: firstNow,
      accessTokenTtlSeconds: 900,
      idleTtlSeconds: 15_552_000,
      ipAddress: "127.0.0.1",
      userAgent: "ElevenHouseIOS/1"
    });

    const committed = await pool.query<{
      challenge_status: string;
      session_count: string;
      active_refresh_count: string;
      event_count: string;
    }>(
      `select
         (select status from auth_challenges where id = $1) as challenge_status,
         (select count(*)::text from mobile_sessions where id = $2) as session_count,
         (select count(*)::text from mobile_refresh_tokens
          where session_id = $2 and status = 'active') as active_refresh_count,
         (select count(*)::text from auth_security_events
          where user_id = $3 and metadata ->> 'mobileSessionId' = $2::text) as event_count`,
      [challengeId, result.session.id, userId]
    );
    expect(committed.rows[0]).toEqual({
      challenge_status: "consumed",
      session_count: "1",
      active_refresh_count: "1",
      event_count: "1"
    });

    const duplicateChallengeId = await seedChallenge("atomic@example.com", "654321");
    const duplicateAccessToken = "duplicate-access";
    await createMobileSession({
      sessions: createDrizzleMobileSessionUnitOfWork(runtime.database),
      tokenIssuer: fixedTokenIssuer([duplicateAccessToken, "duplicate-existing-refresh"]),
      userId,
      platform: "ios",
      deviceLabel: "Existing Duplicate",
      now: firstNow,
      accessTokenTtlSeconds: 900,
      idleTtlSeconds: 15_552_000
    });

    await expect(
      verifyMobilePasswordlessLogin({
        login,
        tokenIssuer: fixedTokenIssuer([duplicateAccessToken, "duplicate-new-refresh"]),
        challengeId: duplicateChallengeId,
        code: "654321",
        codeSecret: "integration-secret",
        platform: "ios",
        deviceLabel: "Failing Atomic iPhone",
        now: firstNow,
        accessTokenTtlSeconds: 900,
        idleTtlSeconds: 15_552_000
      })
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    const rolledBack = await pool.query<{
      challenge_status: string;
      failing_session_count: string;
      failing_event_count: string;
    }>(
      `select
         (select status from auth_challenges where id = $1) as challenge_status,
         (select count(*)::text from mobile_sessions
          where user_id = $2 and device_label = 'Failing Atomic iPhone') as failing_session_count,
         (select count(*)::text from auth_security_events
          where user_id = $2 and metadata ->> 'mobileSessionId' in (
            select id::text from mobile_sessions where device_label = 'Failing Atomic iPhone'
          )) as failing_event_count`,
      [duplicateChallengeId, userId]
    );
    expect(rolledBack.rows[0]).toEqual({
      challenge_status: "pending",
      failing_session_count: "0",
      failing_event_count: "0"
    });
  });

  async function seedAstrologer(email = `${randomUUID()}@example.com`): Promise<string> {
    const userId = randomUUID();
    await pool.query("insert into users (id) values ($1)", [userId]);
    await pool.query(
      `insert into auth_identities
       (user_id, provider, provider_subject, email, email_verified_at)
       values ($1, 'email', $2, $2, $3)`,
      [userId, email, firstNow]
    );
    await pool.query(
      "insert into user_role_assignments (user_id, role, assigned_at) values ($1, 'astrologer', $2)",
      [userId, firstNow]
    );
    return userId;
  }

  async function seedChallenge(email: string, code: string): Promise<string> {
    const challengeId = randomUUID();
    await pool.query(
      `insert into auth_challenges
       (id, channel, identifier, identifier_normalized, code_hash, requested_roles,
        max_attempts, expires_at, resend_available_at, created_at, updated_at)
       values ($1, 'email', $2, $2, $3, '["astrologer"]'::jsonb,
        5, $4, $5, $6, $6)`,
      [
        challengeId,
        email,
        hashPasswordlessCode({
          secret: "integration-secret",
          channel: "email",
          identifierNormalized: email,
          code
        }),
        "2026-08-12T10:10:00.000Z",
        "2026-08-12T10:01:00.000Z",
        "2026-08-12T09:59:00.000Z"
      ]
    );
    return challengeId;
  }

  async function createSession(userId: string, deviceLabel: string, now: Date) {
    return createMobileSession({
      sessions: createDrizzleMobileSessionUnitOfWork(runtime.database),
      tokenIssuer: tokenIssuer(deviceLabel),
      userId,
      platform: "ios",
      deviceLabel,
      now,
      accessTokenTtlSeconds: 900,
      idleTtlSeconds: 15_552_000
    });
  }

  async function readFamily(sessionId: string): Promise<{
    sessionStatus: string;
    activeRefreshCount: number;
    refreshStatuses: string[];
  }> {
    const result = await pool.query<{
      session_status: string;
      active_refresh_count: number;
      refresh_statuses: string[];
    }>(
      `select session.status as session_status,
         count(*) filter (where token.status = 'active')::integer as active_refresh_count,
         array_agg(token.status order by token.created_at, token.id) as refresh_statuses
       from mobile_sessions session
       join mobile_refresh_tokens token on token.session_id = session.id
       where session.id = $1
       group by session.id`,
      [sessionId]
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Mobile session family not found: ${sessionId}`);
    return {
      sessionStatus: row.session_status,
      activeRefreshCount: row.active_refresh_count,
      refreshStatuses: row.refresh_statuses
    };
  }
});

function retryReceiptCipher() {
  return { encrypt: () => "integration-encrypted-token-pair" };
}

function tokenIssuer(prefix: string) {
  return {
    issueToken: () => {
      const token = `${prefix}-${randomUUID()}`;
      return { token, tokenHash: hashSessionToken(token) };
    }
  };
}

function fixedTokenIssuer(tokens: readonly string[]) {
  let index = 0;
  return {
    issueToken: () => {
      const token = tokens[index++];
      if (!token) throw new Error("Fixed token issuer exhausted");
      return { token, tokenHash: hashSessionToken(token) };
    }
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Mobile session concurrency test timed out")),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV ?? "development", "integration-test");
  return value;
}

function withDatabaseName(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
