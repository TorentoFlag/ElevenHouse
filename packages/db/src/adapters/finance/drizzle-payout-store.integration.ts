import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { createDrizzlePayoutStore } from "./drizzle-payout-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_payout_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;

describe("payout Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
    await runtime.pool.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("marks rejected manual payout requests completed with admin evidence", async () => {
    const fixture = await createFixture();
    const store = createDrizzlePayoutStore(runtime.database);

    const rejected = await store.updateRequestStatus({
      payoutRequestId: fixture.payoutRequestId,
      status: "rejected",
      adminUserId: fixture.adminUserId,
      failureReason: "Bank details do not match recipient",
      adminNote: "Astrologer must update payout method",
      now: "2026-07-27T10:00:00.000Z"
    });

    expect(rejected).toMatchObject({
      id: fixture.payoutRequestId,
      status: "rejected",
      reviewedAt: "2026-07-27T10:00:00.000Z",
      completedAt: "2026-07-27T10:00:00.000Z",
      adminUserId: fixture.adminUserId,
      failureReason: "Bank details do not match recipient",
      adminNote: "Astrologer must update payout method"
    });
  });

  it("marks cancelled manual payout requests completed without failure evidence", async () => {
    const fixture = await createFixture();
    const store = createDrizzlePayoutStore(runtime.database);

    const cancelled = await store.updateRequestStatus({
      payoutRequestId: fixture.payoutRequestId,
      status: "cancelled",
      adminUserId: fixture.adminUserId,
      adminNote: "Duplicate request",
      now: "2026-07-27T10:30:00.000Z"
    });

    expect(cancelled).toMatchObject({
      id: fixture.payoutRequestId,
      status: "cancelled",
      reviewedAt: "2026-07-27T10:30:00.000Z",
      completedAt: "2026-07-27T10:30:00.000Z",
      adminUserId: fixture.adminUserId,
      failureReason: null,
      adminNote: "Duplicate request"
    });
  });
});

async function createFixture(): Promise<{
  readonly astrologerUserId: string;
  readonly adminUserId: string;
  readonly payoutRequestId: string;
}> {
  const astrologerUserId = randomUUID();
  const adminUserId = randomUUID();
  const payoutMethodId = randomUUID();
  const payoutRequestId = randomUUID();

  await runtime.pool.query("insert into users (id) values ($1), ($2)", [
    astrologerUserId,
    adminUserId
  ]);
  await runtime.pool.query(
    `insert into payout_methods
      (id, astrologer_user_id, method, currency, display_name, manual_bank_transfer_details, is_default)
     values ($1, $2, 'manual_bank_transfer', 'RUB', 'Main account', '{"bankName":"T-Bank"}'::jsonb, true)`,
    [payoutMethodId, astrologerUserId]
  );
  await runtime.pool.query(
    `insert into payout_requests
      (id, astrologer_user_id, payout_method_id, status, amount_minor, currency, method, requested_at, metadata)
     values ($1, $2, $3, 'requested', 1000000, 'RUB', 'manual_bank_transfer',
       '2026-07-27T09:00:00.000Z', '{}'::jsonb)`,
    [payoutRequestId, astrologerUserId, payoutMethodId]
  );

  return { astrologerUserId, adminUserId, payoutRequestId };
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
