import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { createDrizzleReconciliationStore } from "./drizzle-reconciliation-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_reconciliation_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;

describe("reconciliation Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
    await runtime.pool.query(readCurrentMigrationSql());
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("creates deduped matched and exception records, lists open exceptions and resolves them", async () => {
    const fixture = await createFixture();
    const store = createDrizzleReconciliationStore(runtime.database);

    await expect(
      store.findAttemptByProviderPaymentId({
        provider: "arc_pay",
        providerPaymentId: fixture.providerPaymentId
      })
    ).resolves.toMatchObject({
      id: fixture.paymentAttemptId,
      amount: { amountMinor: 50_000, currency: "RUB" }
    });

    const matched = await store.createRecord({
      provider: "arc_pay",
      providerPaymentId: fixture.providerPaymentId,
      providerPayoutId: null,
      providerSettlementId: "settlement-2026-07-27",
      providerEventId: fixture.settledEventId,
      status: "matched",
      exceptionCode: null,
      exceptionMessage: null,
      providerOccurredAt: "2026-07-27T07:30:00.000Z",
      checkedAt: "2026-07-27T08:00:00.000Z",
      payload: { source: "payment.settled" }
    });
    const replayedMatched = await store.createRecord({
      ...matched.record,
      payload: { source: "payment.settled", replay: true }
    });

    expect(matched.kind).toBe("created");
    expect(replayedMatched.kind).toBe("replayed");
    expect(replayedMatched.record.id).toBe(matched.record.id);

    const ledgerMatched = await store.createRecord({
      provider: "arc_pay",
      providerPaymentId: fixture.providerPaymentId,
      providerPayoutId: null,
      providerSettlementId: "ledger-entry-2026-07-27-1",
      providerEventId: null,
      status: "matched",
      exceptionCode: null,
      exceptionMessage: null,
      providerOccurredAt: "2026-07-27T07:45:00.000Z",
      checkedAt: "2026-07-27T08:10:00.000Z",
      payload: { source: "settlement.ledger" }
    });
    const replayedLedgerMatched = await store.createRecord({
      provider: "arc_pay",
      providerPaymentId: fixture.providerPaymentId,
      providerPayoutId: null,
      providerSettlementId: "ledger-entry-2026-07-27-1",
      providerEventId: null,
      status: "matched",
      exceptionCode: null,
      exceptionMessage: null,
      providerOccurredAt: "2026-07-27T07:45:00.000Z",
      checkedAt: "2026-07-27T08:15:00.000Z",
      payload: { source: "settlement.ledger", replay: true }
    });

    expect(ledgerMatched.kind).toBe("created");
    expect(replayedLedgerMatched.kind).toBe("replayed");
    expect(replayedLedgerMatched.record.id).toBe(ledgerMatched.record.id);

    const exception = await store.createRecord({
      provider: "arc_pay",
      providerPaymentId: fixture.providerPaymentId,
      providerPayoutId: null,
      providerSettlementId: "settlement-2026-07-27",
      providerEventId: fixture.exceptionEventId,
      status: "exception",
      exceptionCode: "amount_mismatch",
      exceptionMessage: "Provider amount differs from local payment",
      providerOccurredAt: "2026-07-27T07:35:00.000Z",
      checkedAt: "2026-07-27T08:05:00.000Z",
      payload: { source: "reconciliation.exception" }
    });
    expect(exception.kind).toBe("created");

    await expect(store.listOpenExceptions({ limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        id: exception.record.id,
        status: "exception",
        exceptionCode: "amount_mismatch",
        resolvedAt: null
      })
    ]);

    const resolved = await store.resolveException({
      reconciliationRecordId: exception.record.id,
      resolution: "waived",
      resolvedAt: "2026-07-27T09:00:00.000Z",
      adminNote: "Below audit threshold after finance review"
    });
    expect(resolved).toMatchObject({
      id: exception.record.id,
      status: "ignored",
      resolvedAt: "2026-07-27T09:00:00.000Z",
      payload: expect.objectContaining({
        resolution: "waived",
        adminNote: "Below audit threshold after finance review"
      })
    });
    await expect(store.listOpenExceptions({ limit: 10 })).resolves.toEqual([]);
  });
});

async function createFixture(): Promise<{
  readonly providerPaymentId: string;
  readonly paymentAttemptId: string;
  readonly settledEventId: string;
  readonly exceptionEventId: string;
}> {
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const productId = randomUUID();
  const policyId = randomUUID();
  const tariffSeriesId = `tariff-${randomUUID()}`;
  const tariffVersionDigest = `sha256:${randomUUID().replaceAll("-", "").repeat(2)}`;
  const orderId = randomUUID();
  const paymentAttemptId = randomUUID();
  const providerPaymentId = randomUUID();
  const settledEventId = randomUUID();
  const exceptionEventId = randomUUID();

  await runtime.pool.query("insert into users (id) values ($1), ($2)", [
    astrologerUserId,
    clientUserId
  ]);
  await runtime.pool.query(
    `insert into products
      (id, owner_user_id, type, status, title, price_minor, currency, execution_mode, payment_model, duration_minutes, participant_mode)
     values ($1, $2, 'single', 'active', 'Reconciliation integration', 50000, 'RUB', 'live', 'once', 60, 'solo')`,
    [productId, astrologerUserId]
  );
  await runtime.pool.query(
    `insert into finance_policies
      (id, policy_version, risk_tier, hold_duration_hours, is_active)
     values ($1, 1, 'standard', 48, false)`,
    [policyId]
  );
  await insertTariffVersion({ tariffSeriesId, tariffVersionDigest, commissionBps: 1000 });
  await runtime.pool.query(
    `insert into orders
      (id, client_user_id, astrologer_user_id, product_id, status,
       product_title_snapshot,
       gross_amount_minor, gross_currency, platform_fee_amount_minor, platform_fee_currency,
       astrologer_net_amount_minor, astrologer_net_currency, finance_policy_snapshot_id,
       finance_policy_risk_tier, finance_policy_hold_duration_hours,
       finance_policy_reserve_bps, finance_policy_reserve_release_delay_days,
       tariff_series_id, tariff_version, tariff_version_digest, tariff_commission_bps,
       finance_policy_provider_settlement_required)
     values ($1, $2, $3, $4, 'paid', 'Reconciliation integration', 50000, 'RUB', 5000, 'RUB', 45000, 'RUB',
       $5, 'standard', 48, 0, 0, $6, 1, $7, 1000, true)`,
    [orderId, clientUserId, astrologerUserId, productId, policyId, tariffSeriesId, tariffVersionDigest]
  );
  await runtime.pool.query(
    `insert into payment_attempts
      (id, order_id, provider, status, amount_minor, currency,
       provider_payment_id, provider_checkout_id, idempotency_key, metadata)
     values ($1, $2, 'arc_pay', 'settled', 50000, 'RUB', $3, $4, $5, '{}'::jsonb)`,
    [paymentAttemptId, orderId, providerPaymentId, randomUUID(), `checkout:${paymentAttemptId}`]
  );
  await runtime.pool.query(
    `insert into payment_provider_events
      (id, payment_attempt_id, provider, provider_webhook_id,
       provider_payment_id, type, occurred_at, received_at, payload)
     values
      ($1, $2, 'arc_pay', 'wh_settled_1', $3, 'payment.settled',
       '2026-07-27T07:30:00.000Z', '2026-07-27T08:00:00.000Z', '{}'::jsonb),
      ($4, $2, 'arc_pay', 'wh_reconciliation_exception_1', $3, 'reconciliation.exception',
       '2026-07-27T07:35:00.000Z', '2026-07-27T08:05:00.000Z', '{}'::jsonb)`,
    [settledEventId, paymentAttemptId, providerPaymentId, exceptionEventId]
  );

  return { providerPaymentId, paymentAttemptId, settledEventId, exceptionEventId };
}

async function insertTariffVersion(input: {
  readonly tariffSeriesId: string;
  readonly tariffVersionDigest: string;
  readonly commissionBps: number;
}): Promise<void> {
  await runtime.pool.query(`insert into platform_tariff_series (id, code) values ($1, $2)`, [
    input.tariffSeriesId,
    input.tariffSeriesId
  ]);
  await runtime.pool.query(
    `insert into platform_tariff_versions
       (tariff_series_id, version, lifecycle, name, tagline, monthly_price_minor, yearly_price_minor,
        currency, client_sale_commission_bps, display_order, canonical_preimage, canonical_digest)
     values ($1, 1, 'draft', 'Integration tariff', 'Integration tariff', 0, 0,
        'RUB', $2, 0, '{"schemaVersion":"integration.v1"}', $3)`,
    [input.tariffSeriesId, input.commissionBps, input.tariffVersionDigest]
  );
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
