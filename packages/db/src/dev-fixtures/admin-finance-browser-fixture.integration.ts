import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { assertDevelopmentDatabaseUrl } from "../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../runtime";
import { seedAdminFinanceBrowserFixture } from "./admin-finance-browser-fixture";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_admin_finance_fixture_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;

describe("admin finance browser fixture", () => {
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

  it("seeds an authenticated admin finance state for network-backed browser acceptance", async () => {
    const first = await seedAdminFinanceBrowserFixture(runtime);
    const second = await seedAdminFinanceBrowserFixture(runtime);

    expect(second).toEqual(first);
    expect(first.sessionCookie).toBe(`elevenhouse_admin_session=${first.sessionToken}`);

    const session = await runtime.pool.query<{
      readonly status: string;
      readonly role: string;
      readonly token_hash: string;
    }>(
      `select sessions.status, roles.role, sessions.token_hash
       from user_sessions sessions
       inner join user_role_assignments roles on roles.user_id = sessions.user_id
       where sessions.user_id = $1`,
      [first.adminUserId]
    );
    expect(session.rows).toEqual([
      {
        status: "active",
        role: "admin",
        token_hash: first.sessionTokenHash
      }
    ]);

    const policies = await runtime.pool.query<{ readonly count: string }>(
      "select count(*)::text from finance_policies where is_active = true and risk_tier = 'manual_review'"
    );
    expect(policies.rows[0]?.count).toBe("1");

    const payouts = await runtime.pool.query<{
      readonly id: string;
      readonly status: string;
      readonly amount_minor: string;
      readonly failure_reason: string | null;
    }>(
      `select id, status, amount_minor::text, failure_reason
       from payout_requests
       where astrologer_user_id = $1
       order by requested_at desc, id desc`,
      [first.astrologerUserId]
    );
    expect(payouts.rows).toEqual([
      {
        id: first.chargebackBlockedPayoutRequestId,
        status: "cancelled",
        amount_minor: "45000",
        failure_reason: "Provider chargeback blocked payout before paid confirmation"
      },
      {
        id: first.openPayoutRequestId,
        status: "requested",
        amount_minor: "1000000",
        failure_reason: null
      }
    ]);

    const reversalCase = await runtime.pool.query<{
      readonly event_type: string;
      readonly order_status: string;
      readonly payment_attempt_status: string;
      readonly ledger_operation_type: string;
    }>(
      `select events.type as event_type,
              orders.status as order_status,
              attempts.status as payment_attempt_status,
              ledger.operation_type as ledger_operation_type
       from payment_provider_events events
       inner join payment_attempts attempts on attempts.id = events.payment_attempt_id
       inner join orders on orders.id = attempts.order_id
       inner join ledger_transactions ledger on ledger.order_id = orders.id
       where events.id = $1
         and ledger.metadata->>'providerEventId' = events.id::text`,
      [first.chargebackProviderEventId]
    );
    expect(reversalCase.rows).toEqual([
      {
        event_type: "payment.chargeback",
        order_status: "chargeback",
        payment_attempt_status: "chargeback",
        ledger_operation_type: "chargeback_recorded"
      }
    ]);

    const reconciliation = await runtime.pool.query<{ readonly status: string }>(
      "select status from reconciliation_records where id = $1",
      [first.reconciliationExceptionId]
    );
    expect(reconciliation.rows).toEqual([{ status: "exception" }]);
  });
});

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
