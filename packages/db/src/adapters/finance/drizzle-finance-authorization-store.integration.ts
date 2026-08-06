import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { randomUUID } from "node:crypto";

import {
  beginFinanceAuthorization,
  consumeFinanceAuthorizationGrant,
  FinanceAuthorizationRejectedError,
  verifyFinanceAuthorizationAndIssueGrant
} from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  createDrizzleFinanceAuthorizationStore,
  transactDrizzleFinanceAuthorizationCommand,
  createDrizzleFinanceAuthorizationVerificationUnitOfWork,
  createDrizzleFinanceWebAuthnRegistrationStore
} from "./drizzle-finance-authorization-store";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_finance_auth_store_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const actorUserId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const aggregateId = "33333333-3333-4333-8333-333333333333";

describe.sequential("finance authorization Drizzle persistence", () => {
  const admin = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;
  let database: ElevenHouseDatabase;

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    database = drizzle(pool) as unknown as ElevenHouseDatabase;
    await pool.query(readCurrentMigrationSql());
    await pool.query("insert into users (id) values ($1)", [actorUserId]);
    await pool.query(
      `insert into user_sessions (id, user_id, token_hash, expires_at)
       values ($1, $2, 'finance-auth-session-token', clock_timestamp() + interval '1 day')`,
      [sessionId, actorUserId]
    );
    await pool.query(
      `insert into finance_webauthn_credentials
       (credential_id, owner_user_id, public_key, transports, device_type, backed_up)
       values ('finance-auth-credential', $1, decode('00', 'hex'), '["internal"]'::jsonb, 'singleDevice', false)`,
      [actorUserId]
    );
  }, 30_000);

  afterAll(async () => {
    try {
      await pool?.end();
      await admin.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await admin.end();
    }
  }, 30_000);

  it("locks the challenge, advances the passkey counter and creates exactly one consumable grant", async () => {
    const exactNow = new Date();
    exactNow.setMilliseconds(460);
    const clock = { now: () => exactNow.toISOString() };
    const store = createDrizzleFinanceAuthorizationStore(database);
    const command = {
      actorUserId,
      sessionId,
      sessionKind: "standard" as const,
      actionKind: "refund_execute" as const,
      aggregateId,
      expectedVersion: 7,
      payload: { refundId: aggregateId, amountMinor: 9600, currency: "RUB" }
    };
    const begun = await beginFinanceAuthorization({
      ...command,
      store,
      clock,
      randomSource: { randomBytes: (length) => Uint8Array.from({ length }, (_, index) => index) },
      rpId: "admin.elevenhouse.test",
      origin: "https://admin.elevenhouse.test"
    });

    const issued = await verifyFinanceAuthorizationAndIssueGrant({
      actorUserId,
      sessionId,
      sessionKind: "standard",
      challengeId: begun.challengeId,
      assertion: { id: "opaque-browser-assertion" },
      store,
      verificationUnitOfWork: createDrizzleFinanceAuthorizationVerificationUnitOfWork({ database }),
      verifier: {
        verifyAssertion: async () => ({
          verified: true,
          userVerified: true,
          credentialId: "finance-auth-credential",
          signatureCounter: 1
        })
      },
      clock
    });
    expect(issued.expiresAt).toBeTruthy();
    expect((await store.findChallengeById(begun.challengeId))?.status).toBe("consumed");
    expect(
      await pool.query(
        "select signature_counter::text from finance_webauthn_credentials where credential_id = 'finance-auth-credential'"
      )
    ).toMatchObject({ rows: [{ signature_counter: "1" }] });

    const proof = await consumeFinanceAuthorizationGrant({
      ...command,
      authorizationId: issued.authorizationId,
      store,
      clock
    });
    expect(proof).toMatchObject({
      authorizationId: issued.authorizationId,
      actionKind: "refund_execute",
      expectedVersion: 7,
      status: "consumed"
    });
    await expect(
      consumeFinanceAuthorizationGrant({ ...command, authorizationId: issued.authorizationId, store, clock })
    ).rejects.toBeInstanceOf(FinanceAuthorizationRejectedError);
  });

  it("consumes a registration ceremony atomically with the public credential record", async () => {
    const store = createDrizzleFinanceWebAuthnRegistrationStore({ database });
    const now = new Date();
    const challenge = await store.createChallenge({
      actorUserId,
      sessionId,
      challenge: "r".repeat(43),
      rpId: "admin.elevenhouse.test",
      origin: "https://admin.elevenhouse.test",
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 300_000).toISOString()
    });
    const first = await store.consumeChallengeAndCreateCredential({
      registrationChallengeId: challenge.id,
      actorUserId,
      sessionId,
      consumedAt: now.toISOString(),
      credential: {
        credentialId: "registered-finance-auth-credential",
        publicKey: Buffer.from([2]),
        transports: ["internal"],
        deviceType: "singleDevice",
        backedUp: false,
        signatureCounter: 0
      }
    });
    expect(first).toMatchObject({
      credentialId: "registered-finance-auth-credential",
      ownerUserId: actorUserId,
      signatureCounter: 0
    });
    await expect(
      store.consumeChallengeAndCreateCredential({
        registrationChallengeId: challenge.id,
        actorUserId,
        sessionId,
        consumedAt: now.toISOString(),
        credential: {
          credentialId: "would-be-replay",
          publicKey: Buffer.from([3]),
          transports: ["internal"],
          deviceType: "singleDevice",
          backedUp: false,
          signatureCounter: 0
        }
      })
    ).resolves.toBeNull();
  });

  it("rolls back a consumed grant when the protected finance command fails", async () => {
    const now = new Date();
    const clock = { now: () => now.toISOString() };
    const store = createDrizzleFinanceAuthorizationStore(database);
    const command = {
      actorUserId,
      sessionId,
      sessionKind: "standard" as const,
      actionKind: "refund_execute" as const,
      aggregateId: randomUUID(),
      expectedVersion: 1,
      payload: { refundId: "refund-atomicity", amountMinor: 1_000, currency: "RUB" }
    };
    const begun = await beginFinanceAuthorization({
      ...command,
      store,
      clock,
      randomSource: { randomBytes: (length) => Uint8Array.from({ length }, (_, index) => index + 1) },
      rpId: "admin.elevenhouse.test",
      origin: "https://admin.elevenhouse.test"
    });
    const issued = await verifyFinanceAuthorizationAndIssueGrant({
      actorUserId,
      sessionId,
      sessionKind: "standard",
      challengeId: begun.challengeId,
      assertion: { id: "opaque-browser-assertion" },
      store,
      verificationUnitOfWork: createDrizzleFinanceAuthorizationVerificationUnitOfWork({ database }),
      verifier: {
        verifyAssertion: async () => ({
          verified: true,
          userVerified: true,
          credentialId: "finance-auth-credential",
          signatureCounter: 2
        })
      },
      clock
    });

    await expect(
      transactDrizzleFinanceAuthorizationCommand({
        database,
        operation: async ({ authorizationStore }) => {
          await consumeFinanceAuthorizationGrant({
            ...command,
            authorizationId: issued.authorizationId,
            store: authorizationStore,
            clock
          });
          throw new Error("protected command rejected");
        }
      })
    ).rejects.toThrow("protected command rejected");

    expect((await store.findGrantById(issued.authorizationId))?.status).toBe("active");
    expect(
      await consumeFinanceAuthorizationGrant({
        ...command,
        authorizationId: issued.authorizationId,
        store,
        clock
      })
    ).toMatchObject({ authorizationId: issued.authorizationId, status: "consumed" });
  });
});

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
