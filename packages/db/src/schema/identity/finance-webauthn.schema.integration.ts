import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_finance_webauthn_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const ownerSessionId = "33333333-3333-4333-8333-333333333333";
const otherSessionId = "44444444-4444-4444-8444-444444444444";
const challengeId = "55555555-5555-4555-8555-555555555555";
const aggregateId = "66666666-6666-4666-8666-666666666666";
const challenge = "a".repeat(43);
const payloadHash = `sha256:${"b".repeat(64)}`;

describe.sequential("finance WebAuthn PostgreSQL invariants", () => {
  const admin = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    await pool.query(readCurrentMigrationSql());
    await seedUsersAndSessions(pool);
  }, 30_000);

  afterAll(async () => {
    try {
      await pool?.end();
      await admin.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await admin.end();
    }
  }, 30_000);

  it("rejects a finance challenge whose actor does not own the authenticated session", async () => {
    await expect(
      insertChallenge({ id: randomUUID(), sessionId: otherSessionId, challenge: "c".repeat(43) })
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("does not own") });
  });

  it("permits exactly one consume transition and rejects subsequent mutation or deletion", async () => {
    await insertChallenge({ id: challengeId, sessionId: ownerSessionId, challenge });

    await pool.query(
      `update finance_authorization_challenges
       set status = 'consumed', consumed_at = clock_timestamp()
       where id = $1`,
      [challengeId]
    );

    await expect(
      pool.query(
        `update finance_authorization_challenges
         set status = 'consumed', consumed_at = clock_timestamp()
         where id = $1`,
        [challengeId]
      )
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("transition") });
    await expect(
      pool.query("delete from finance_authorization_challenges where id = $1", [challengeId])
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("immutable") });
  });

  it("monotonically advances credential counters, permanently quarantines a credential, and rejects truncate", async () => {
    await pool.query(
      `insert into finance_webauthn_credentials
       (credential_id, owner_user_id, public_key, transports, device_type, backed_up)
       values ('credential-one', $1, decode('00', 'hex'), '["internal"]'::jsonb, 'singleDevice', false)`,
      [ownerUserId]
    );
    await pool.query(
      `update finance_webauthn_credentials
       set signature_counter = 1, last_used_at = clock_timestamp()
       where credential_id = 'credential-one'`
    );
    await expect(
      pool.query(
        "update finance_webauthn_credentials set signature_counter = 0 where credential_id = 'credential-one'"
      )
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("counter") });
    await pool.query(
      `update finance_webauthn_credentials
       set status = 'quarantined', quarantined_at = clock_timestamp()
       where credential_id = 'credential-one'`
    );
    await expect(
      pool.query(
        `update finance_webauthn_credentials
         set status = 'active', quarantined_at = null
         where credential_id = 'credential-one'`
      )
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("cannot be reactivated") });
    await expect(pool.query("truncate finance_authorization_challenges")).rejects.toMatchObject({
      code: "23514",
      message: expect.stringContaining("cannot be truncated")
    });
  });

  async function insertChallenge(input: { id: string; sessionId: string; challenge: string }): Promise<void> {
    await pool.query(
      `insert into finance_authorization_challenges
       (id, actor_user_id, session_id, action_kind, aggregate_id, expected_version, payload_hash,
        challenge, rp_id, origin, issued_at, expires_at)
       values ($1, $2, $3, 'refund_execute', $4, 0, $5, $6, 'admin.elevenhouse.test',
        'https://admin.elevenhouse.test', clock_timestamp(), clock_timestamp() + interval '300 seconds')`,
      [input.id, ownerUserId, input.sessionId, aggregateId, payloadHash, input.challenge]
    );
  }
});

async function seedUsersAndSessions(pool: Pool): Promise<void> {
  await pool.query("insert into users (id) values ($1), ($2)", [ownerUserId, otherUserId]);
  await pool.query(
    `insert into user_sessions (id, user_id, token_hash, expires_at)
     values
       ($1, $2, 'owner-session-token', clock_timestamp() + interval '1 day'),
       ($3, $4, 'other-session-token', clock_timestamp() + interval '1 day')`,
    [ownerSessionId, ownerUserId, otherSessionId, otherUserId]
  );
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
