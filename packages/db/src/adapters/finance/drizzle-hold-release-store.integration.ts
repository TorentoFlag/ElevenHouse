import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateLedgerTransactionInput } from "@elevenhouse/domain";
import { Client } from "pg";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { createDrizzleHoldReleaseStore, createDrizzleLedgerStore } from "./drizzle-ledger-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_finance_holds_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;
let policyVersionSequence = 1;

describe("captured sale hold release Drizzle/PostgreSQL integration", () => {
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

  it("lists due captured-sale holds and releases each order exactly once", async () => {
    const fixture = await createFixture();
    const ledger = createDrizzleLedgerStore(runtime.database);
    const holds = createDrizzleHoldReleaseStore(runtime.database);
    const dueProviderPaymentId = "33333333-3333-4333-8333-333333333333";

    await ledger.createTransaction(
      saleCapturedTransaction({
        orderId: fixture.dueOrderId,
        astrologerUserId: fixture.astrologerUserId,
        holdReleaseAt: "2026-07-26T12:00:00.000Z",
        providerPaymentId: dueProviderPaymentId
      })
    );
    await ledger.createTransaction(
      saleCapturedTransaction({
        orderId: fixture.futureOrderId,
        astrologerUserId: fixture.astrologerUserId,
        holdReleaseAt: "2026-07-29T12:00:00.000Z"
      })
    );
    await insertReconciliationRecord({
      providerPaymentId: dueProviderPaymentId,
      status: "matched",
      checkedAt: "2026-07-26T13:00:00.000Z"
    });

    await expect(
      holds.listReleasableCapturedSaleHolds({
        now: "2026-07-27T12:00:00.000Z",
        limit: 10
      })
    ).resolves.toEqual([
      {
        orderId: fixture.dueOrderId,
        astrologerUserId: fixture.astrologerUserId,
        amount: { amountMinor: 43_000, currency: "RUB" },
        capturedAt: "2026-07-24T12:00:00.000Z",
        holdReleaseAt: "2026-07-26T12:00:00.000Z",
        paymentAttemptId: "11111111-1111-4111-8111-111111111111",
        providerEventId: "provider-event-1"
      }
    ]);

    const [dueHold] = await holds.listReleasableCapturedSaleHolds({
      now: "2026-07-27T12:00:00.000Z",
      limit: 10
    });
    if (!dueHold) throw new Error("Expected due hold");

    await expect(
      holds.releaseCapturedSaleHold({
        hold: dueHold,
        now: "2026-07-27T12:00:00.000Z",
        commandExpiresAt: "2026-08-26T12:00:00.000Z"
      })
    ).resolves.toMatchObject({ kind: "released" });
    await expect(
      holds.releaseCapturedSaleHold({
        hold: dueHold,
        now: "2026-07-27T12:00:00.000Z",
        commandExpiresAt: "2026-08-26T12:00:00.000Z"
      })
    ).resolves.toMatchObject({ kind: "replayed" });

    await expect(
      holds.listReleasableCapturedSaleHolds({
        now: "2026-07-27T12:00:00.000Z",
        limit: 10
      })
    ).resolves.toEqual([]);

    const balance = await ledger.findWalletBalance(fixture.astrologerUserId);
    expect(balance).toMatchObject({
      pending: { amountMinor: 43_000, currency: "RUB" },
      available: { amountMinor: 43_000, currency: "RUB" }
    });
    const releaseCount = await runtime.pool.query<{ count: string }>(
      "select count(*)::text as count from ledger_transactions where operation_type = 'funds_released' and order_id = $1",
      [fixture.dueOrderId]
    );
    expect(releaseCount.rows).toEqual([{ count: "1" }]);
  });

  it("blocks required settlement holds until reconciliation matched and no open exception exists", async () => {
    const fixture = await createFixture({ providerSettlementRequired: true });
    const ledger = createDrizzleLedgerStore(runtime.database);
    const holds = createDrizzleHoldReleaseStore(runtime.database);
    const providerPaymentId = "44444444-4444-4444-8444-444444444444";

    await ledger.createTransaction(
      saleCapturedTransaction({
        orderId: fixture.dueOrderId,
        astrologerUserId: fixture.astrologerUserId,
        holdReleaseAt: "2026-07-26T12:00:00.000Z",
        providerPaymentId
      })
    );

    await expect(
      holds.listReleasableCapturedSaleHolds({
        now: "2026-07-27T12:00:00.000Z",
        limit: 10
      })
    ).resolves.toEqual([]);

    await insertReconciliationRecord({
      providerPaymentId,
      status: "matched",
      checkedAt: "2026-07-26T13:00:00.000Z"
    });
    await insertReconciliationRecord({
      providerPaymentId,
      status: "exception",
      checkedAt: "2026-07-26T14:00:00.000Z",
      exceptionCode: "amount_mismatch",
      exceptionMessage: "Provider amount does not match local payment"
    });

    await expect(
      holds.listReleasableCapturedSaleHolds({
        now: "2026-07-27T12:00:00.000Z",
        limit: 10
      })
    ).resolves.toEqual([]);

    await runtime.pool.query(
      `update reconciliation_records
       set resolved_at = '2026-07-27T10:00:00.000Z'
       where provider_payment_id = $1 and status = 'exception'`,
      [providerPaymentId]
    );

    const resolvedHolds = await holds.listReleasableCapturedSaleHolds({
      now: "2026-07-27T12:00:00.000Z",
      limit: 10
    });
    expect(resolvedHolds).toEqual([
      expect.objectContaining({
        orderId: fixture.dueOrderId,
        astrologerUserId: fixture.astrologerUserId,
        amount: { amountMinor: 43_000, currency: "RUB" },
        holdReleaseAt: "2026-07-26T12:00:00.000Z"
      })
    ]);
    const [resolvedHold] = resolvedHolds;
    if (!resolvedHold) throw new Error("Expected reconciled hold");
    await holds.releaseCapturedSaleHold({
      hold: resolvedHold,
      now: "2026-07-27T12:00:00.000Z",
      commandExpiresAt: "2026-08-26T12:00:00.000Z"
    });
  });

  it("allows due holds without reconciliation when the order policy snapshot does not require settlement", async () => {
    const fixture = await createFixture({ providerSettlementRequired: false });
    const ledger = createDrizzleLedgerStore(runtime.database);
    const holds = createDrizzleHoldReleaseStore(runtime.database);

    await ledger.createTransaction(
      saleCapturedTransaction({
        orderId: fixture.dueOrderId,
        astrologerUserId: fixture.astrologerUserId,
        holdReleaseAt: "2026-07-26T12:00:00.000Z",
        providerPaymentId: "55555555-5555-4555-8555-555555555555"
      })
    );

    await expect(
      holds.listReleasableCapturedSaleHolds({
        now: "2026-07-27T12:00:00.000Z",
        limit: 10
      })
    ).resolves.toEqual([
      expect.objectContaining({
        orderId: fixture.dueOrderId,
        astrologerUserId: fixture.astrologerUserId
      })
    ]);
  });
});

async function createFixture(input?: {
  readonly providerSettlementRequired?: boolean;
}): Promise<{
  readonly astrologerUserId: string;
  readonly dueOrderId: string;
  readonly futureOrderId: string;
}> {
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const dueOrderId = randomUUID();
  const futureOrderId = randomUUID();
  const productId = randomUUID();
  const policyId = randomUUID();
  const policyVersion = policyVersionSequence++;

  await runtime.pool.query("insert into users (id) values ($1), ($2)", [
    astrologerUserId,
    clientUserId
  ]);
  await runtime.pool.query(
    `insert into products
      (id, owner_user_id, type, status, title, price_minor, currency, execution_mode, payment_model, duration_minutes, participant_mode)
     values ($1, $2, 'single', 'active', 'Hold release integration', 50000, 'RUB', 'live', 'once', 60, 'solo')`,
    [productId, astrologerUserId]
  );
  await runtime.pool.query(
    `insert into finance_policies
      (id, policy_version, risk_tier, hold_duration_hours, platform_fee_bps, is_active)
     values ($1, $2, 'standard', 48, 1400, false)`,
    [policyId, policyVersion]
  );
  await runtime.pool.query(
    `insert into orders
      (id, client_user_id, astrologer_user_id, product_id, status,
       gross_amount_minor, gross_currency, platform_fee_amount_minor, platform_fee_currency,
       astrologer_net_amount_minor, astrologer_net_currency, finance_policy_snapshot_id,
       finance_policy_risk_tier, finance_policy_hold_duration_hours,
       finance_policy_reserve_bps, finance_policy_reserve_release_delay_days,
       finance_policy_platform_fee_bps, finance_policy_provider_settlement_required)
     values
      ($1, $2, $3, $4, 'paid', 50000, 'RUB', 7000, 'RUB', 43000, 'RUB', $5, 'standard', 48, 0, 0, 1400, $7),
      ($6, $2, $3, $4, 'paid', 50000, 'RUB', 7000, 'RUB', 43000, 'RUB', $5, 'standard', 48, 0, 0, 1400, $7)`,
    [
      dueOrderId,
      clientUserId,
      astrologerUserId,
      productId,
      policyId,
      futureOrderId,
      input?.providerSettlementRequired ?? true
    ]
  );

  return { astrologerUserId, dueOrderId, futureOrderId };
}

function saleCapturedTransaction(input: {
  readonly orderId: string;
  readonly astrologerUserId: string;
  readonly holdReleaseAt: string;
  readonly providerPaymentId?: string;
}): CreateLedgerTransactionInput {
  const providerPaymentId = input.providerPaymentId ?? "33333333-3333-4333-8333-333333333333";
  return {
    operationType: "sale_captured",
    orderId: input.orderId,
    payoutRequestId: null,
    occurredAt: "2026-07-24T12:00:00.000Z",
    postedAt: "2026-07-24T12:00:00.000Z",
    metadata: {
      providerEventId: "provider-event-1",
      paymentAttemptId: "11111111-1111-4111-8111-111111111111",
      provider: "arc_pay",
      environment: "sandbox",
      providerPaymentId,
      holdDurationHours: 48,
      holdReleaseAt: input.holdReleaseAt,
      financePolicySnapshotId: "88888888-8888-4888-8888-888888888888",
      financePolicyRiskTier: "standard"
    },
    entries: [
      {
        account: { accountType: "platform_clearing", astrologerUserId: null, currency: "RUB" },
        side: "debit",
        amount: { amountMinor: 50_000, currency: "RUB" },
        metadata: { orderId: input.orderId, providerEventId: "provider-event-1" }
      },
      {
        account: {
          accountType: "astrologer_pending",
          astrologerUserId: input.astrologerUserId,
          currency: "RUB"
        },
        side: "credit",
        amount: { amountMinor: 43_000, currency: "RUB" },
        metadata: {
          orderId: input.orderId,
          providerEventId: "provider-event-1",
          provider: "arc_pay",
          environment: "sandbox",
          providerPaymentId,
          holdDurationHours: 48,
          holdReleaseAt: input.holdReleaseAt,
          financePolicySnapshotId: "88888888-8888-4888-8888-888888888888"
        }
      },
      {
        account: { accountType: "platform_revenue", astrologerUserId: null, currency: "RUB" },
        side: "credit",
        amount: { amountMinor: 7_000, currency: "RUB" },
        metadata: { orderId: input.orderId, providerEventId: "provider-event-1" }
      }
    ]
  };
}

async function insertReconciliationRecord(input: {
  readonly providerPaymentId: string;
  readonly status: "matched" | "exception";
  readonly checkedAt: string;
  readonly exceptionCode?: string;
  readonly exceptionMessage?: string;
}): Promise<void> {
  await runtime.pool.query(
    `insert into reconciliation_records
      (provider, environment, provider_payment_id, status, exception_code, exception_message, checked_at, payload)
     values ('arc_pay', 'sandbox', $1, $2, $3, $4, $5, '{}'::jsonb)`,
    [
      input.providerPaymentId,
      input.status,
      input.exceptionCode ?? null,
      input.exceptionMessage ?? null,
      input.checkedAt
    ]
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
