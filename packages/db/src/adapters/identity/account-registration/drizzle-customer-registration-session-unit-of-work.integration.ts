import { createHash, randomUUID } from "node:crypto";
import {
  claimClientJoinIntent,
  hashPasswordlessCode,
  registerCustomerAccountWithSession,
  verifyPasswordlessCodeAndRegisterCustomerAccountWithSession
} from "@elevenhouse/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDrizzleCustomerAccountRegistrationSessionUnitOfWork,
  createDrizzlePasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "./index";
import { assertDevelopmentDatabaseUrl } from "../../../connection";
import { createPostgresRuntime } from "../../../runtime";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);

describe("customer registration with initial session Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({
    DATABASE_URL: databaseUrl
  });

  const createdUserIds: string[] = [];
  const createdChallengeIds: string[] = [];
  const createdJoinIntentIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      if (createdUserIds.length > 0) {
        await runtime.pool.query(
          "delete from auth_security_events where user_id = any($1::uuid[])",
          [createdUserIds]
        );
      }
      if (createdJoinIntentIds.length > 0) {
        await runtime.pool.query("delete from client_join_intents where id = any($1::uuid[])", [
          createdJoinIntentIds
        ]);
      }
      for (const userId of createdUserIds) {
        await runtime.pool.query("delete from users where id = $1", [userId]);
      }
      if (createdChallengeIds.length > 0) {
        await runtime.pool.query("delete from auth_challenges where id = any($1::uuid[])", [
          createdChallengeIds
        ]);
      }
    } finally {
      await runtime.close();
    }
  });

  it("rolls back account, identity and roles when initial session creation fails", async () => {
    const tokenHash = `integration-session-${randomUUID()}`;
    const firstEmail = `integration-${randomUUID()}@example.com`;
    const failedEmail = `integration-${randomUUID()}@example.com`;
    const createdAt = new Date("2026-06-15T10:00:00.000Z");
    const expiresAt = new Date("2026-06-22T10:00:00.000Z");

    const firstResult = await registerCustomerAccountWithSession({
      registration: createDrizzleCustomerAccountRegistrationSessionUnitOfWork(runtime.database),
      identity: {
        provider: "email",
        providerSubject: firstEmail,
        email: firstEmail,
        emailVerifiedAt: createdAt
      },
      displayName: "Integration Client",
      roles: ["client"],
      session: {
        tokenHash,
        createdAt,
        expiresAt
      },
      securityEventType: "registration_succeeded"
    });
    createdUserIds.push(firstResult.user.id);

    await expect(
      registerCustomerAccountWithSession({
        registration: createDrizzleCustomerAccountRegistrationSessionUnitOfWork(runtime.database),
        identity: {
          provider: "email",
          providerSubject: failedEmail,
          email: failedEmail,
          emailVerifiedAt: createdAt
        },
        displayName: "Failed Client",
        roles: ["client"],
        session: {
          tokenHash,
          createdAt,
          expiresAt
        },
        securityEventType: "registration_succeeded"
      })
    ).rejects.toThrow();

    const persistedFailedIdentity = await runtime.pool.query<{ id: string }>(
      "select id from auth_identities where email = $1",
      [failedEmail]
    );
    const persistedFailedProfile = await runtime.pool.query<{ user_id: string }>(
      `select user_profiles.user_id
       from user_profiles
       join auth_identities on auth_identities.user_id = user_profiles.user_id
       where auth_identities.email = $1`,
      [failedEmail]
    );

    expect(persistedFailedIdentity.rows).toEqual([]);
    expect(persistedFailedProfile.rows).toEqual([]);
  });

  it("persists registration, session, client projection and direct-link relationship in one UoW", async () => {
    const challengeId = randomUUID();
    const joinIntentId = randomUUID();
    const astrologerUserId = randomUUID();
    const code = "123456";
    const codeSecret = "integration-secret";
    const email = `integration-${randomUUID()}@example.com`;
    const joinToken = `join_${randomUUID().replaceAll("-", "")}`;
    const now = new Date("2026-08-03T10:00:00.000Z");
    const expiresAt = new Date("2026-08-03T10:10:00.000Z");
    createdChallengeIds.push(challengeId);
    createdJoinIntentIds.push(joinIntentId);
    createdUserIds.push(astrologerUserId);
    await runtime.pool.query("insert into users (id, status) values ($1, 'active')", [
      astrologerUserId
    ]);
    await runtime.pool.query(
      "insert into user_profiles (user_id, display_name) values ($1, 'Registration Astrologer')",
      [astrologerUserId]
    );
    await runtime.pool.query(
      "insert into user_role_assignments (user_id, role) values ($1, 'astrologer')",
      [astrologerUserId]
    );
    await runtime.pool.query(
      `insert into client_join_intents (
         id, astrologer_user_id, token_hash, public_handle_snapshot, status, expires_at
       ) values ($1, $2, $3, 'registration-astrologer', 'pending', $4)`,
      [joinIntentId, astrologerUserId, hashJoinToken(joinToken), expiresAt]
    );
    await runtime.pool.query(
      `insert into auth_challenges (
         id, channel, identifier, identifier_normalized, code_hash, requested_roles,
         status, attempts, max_attempts, expires_at, resend_available_at, created_at, updated_at
       ) values ($1, 'email', $2, $2, $3, '["client"]'::jsonb,
         'pending', 0, 5, $4, $5, $6, $6)`,
      [
        challengeId,
        email,
        hashPasswordlessCode({
          secret: codeSecret,
          channel: "email",
          identifierNormalized: email,
          code
        }),
        expiresAt,
        new Date("2026-08-03T10:01:00.000Z"),
        now
      ]
    );

    const result = await verifyPasswordlessCodeAndRegisterCustomerAccountWithSession({
      registration: createDrizzlePasswordlessCustomerAccountRegistrationSessionUnitOfWork(
        runtime.database
      ),
      challengeId,
      code,
      codeSecret,
      now,
      displayName: "Projected Registration Client",
      roles: ["client"],
      session: {
        tokenHash: `integration-session-${randomUUID()}`,
        expiresAt: new Date("2026-08-10T10:00:00.000Z")
      },
      securityEventType: "registration_succeeded",
      afterRegistered: async ({ store, account }) => {
        await store.upsertClientProfile({
          userId: account.user.id,
          displayNameSnapshot: account.userProfile.displayName,
          preferredLocale: null,
          timezone: null,
          now: now.toISOString()
        });
        await claimClientJoinIntent({
          store,
          token: joinToken,
          tokenHasher: hashJoinToken,
          clientUserId: account.user.id,
          now
        });
      }
    });
    createdUserIds.push(result.user.id);

    const persisted = await runtime.pool.query<{
      user_display_name: string;
      display_name_snapshot: string | null;
      preferred_locale: string | null;
      timezone: string | null;
      session_status: string;
      relationship_status: string;
      relationship_source: string;
      intent_status: string;
      claimed_by_client_user_id: string | null;
    }>(
      `select
         user_profile.display_name as user_display_name,
         client_profile.display_name_snapshot,
         client_profile.preferred_locale,
         client_profile.timezone,
         session.status as session_status,
         relationship.status as relationship_status,
         relationship.source as relationship_source,
         intent.status as intent_status,
         intent.claimed_by_client_user_id
       from users as account
       join user_profiles as user_profile on user_profile.user_id = account.id
       join client_profiles as client_profile on client_profile.user_id = account.id
       join user_sessions as session on session.user_id = account.id
       join client_astrologer_relationships as relationship
         on relationship.client_user_id = account.id and relationship.astrologer_user_id = $2
       join client_join_intents as intent on intent.id = $3
       where account.id = $1`,
      [result.user.id, astrologerUserId, joinIntentId]
    );
    expect(persisted.rows).toEqual([
      {
        user_display_name: "Projected Registration Client",
        display_name_snapshot: "Projected Registration Client",
        preferred_locale: null,
        timezone: null,
        session_status: "active",
        relationship_status: "active",
        relationship_source: "direct_link",
        intent_status: "claimed",
        claimed_by_client_user_id: result.user.id
      }
    ]);
  });

  it("rolls back the full registration when direct-link claiming fails", async () => {
    const challengeId = randomUUID();
    const code = "123456";
    const codeSecret = "integration-secret";
    const email = `integration-${randomUUID()}@example.com`;
    const displayName = `Rollback Client ${randomUUID().slice(0, 8)}`;
    const now = new Date("2026-08-03T11:00:00.000Z");
    createdChallengeIds.push(challengeId);
    await runtime.pool.query(
      `insert into auth_challenges (
         id, channel, identifier, identifier_normalized, code_hash, requested_roles,
         status, attempts, max_attempts, expires_at, resend_available_at, created_at, updated_at
       ) values ($1, 'email', $2, $2, $3, '["client"]'::jsonb,
         'pending', 0, 5, $4, $5, $6, $6)`,
      [
        challengeId,
        email,
        hashPasswordlessCode({
          secret: codeSecret,
          channel: "email",
          identifierNormalized: email,
          code
        }),
        new Date("2026-08-03T11:10:00.000Z"),
        new Date("2026-08-03T11:01:00.000Z"),
        now
      ]
    );

    await expect(
      verifyPasswordlessCodeAndRegisterCustomerAccountWithSession({
        registration: createDrizzlePasswordlessCustomerAccountRegistrationSessionUnitOfWork(
          runtime.database
        ),
        challengeId,
        code,
        codeSecret,
        now,
        displayName,
        roles: ["client"],
        session: {
          tokenHash: `integration-session-${randomUUID()}`,
          expiresAt: new Date("2026-08-10T11:00:00.000Z")
        },
        securityEventType: "registration_succeeded",
        afterRegistered: async ({ store, account }) => {
          await store.upsertClientProfile({
            userId: account.user.id,
            displayNameSnapshot: account.userProfile.displayName,
            preferredLocale: null,
            timezone: null,
            now: now.toISOString()
          });
          await claimClientJoinIntent({
            store,
            token: `join_${randomUUID().replaceAll("-", "")}`,
            tokenHasher: hashJoinToken,
            clientUserId: account.user.id,
            now
          });
        }
      })
    ).rejects.toMatchObject({ name: "ClientJoinIntentError" });

    const persisted = await runtime.pool.query<{
      users: string;
      client_profiles: string;
      sessions: string;
      relationships: string;
      challenge_status: string;
    }>(
      `select
         (select count(*) from user_profiles where display_name = $1)::text as users,
         (select count(*) from client_profiles as client_profile
          join user_profiles as user_profile on user_profile.user_id = client_profile.user_id
          where user_profile.display_name = $1)::text as client_profiles,
         (select count(*) from user_sessions as session
          join user_profiles as user_profile on user_profile.user_id = session.user_id
          where user_profile.display_name = $1)::text as sessions,
         (select count(*) from client_astrologer_relationships as relationship
          join user_profiles as user_profile on user_profile.user_id = relationship.client_user_id
          where user_profile.display_name = $1)::text as relationships,
         (select status from auth_challenges where id = $2) as challenge_status`,
      [displayName, challengeId]
    );
    expect(persisted.rows).toEqual([
      {
        users: "0",
        client_profiles: "0",
        sessions: "0",
        relationships: "0",
        challenge_status: "pending"
      }
    ]);
  });
});

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  }

  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function hashJoinToken(token: string): string {
  return `sha256:${createHash("sha256").update(token, "utf8").digest("hex")}`;
}
