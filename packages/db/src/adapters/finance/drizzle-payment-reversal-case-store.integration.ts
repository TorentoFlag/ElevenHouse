import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateLedgerTransactionInput } from "@elevenhouse/domain";
import { Client } from "pg";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { createDrizzleLedgerStore, createDrizzlePaymentReversalCaseStore } from "./index";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_reversal_cases_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;

describe("admin payment reversal case Drizzle/PostgreSQL integration", () => {
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

  it("lists refund and chargeback cases with provider, ledger and wallet evidence", async () => {
    const fixture = await createFixture();
    const ledger = createDrizzleLedgerStore(runtime.database);
    await ledger.createTransaction(
      saleCapturedTransaction({
        orderId: fixture.refundOrderId,
        astrologerUserId: fixture.astrologerUserId,
        paymentAttemptId: fixture.refundAttemptId,
        providerPaymentId: fixture.refundProviderPaymentId
      })
    );
    await ledger.createTransaction(
      refundRecordedTransaction({
        orderId: fixture.refundOrderId,
        astrologerUserId: fixture.astrologerUserId,
        paymentAttemptId: fixture.refundAttemptId,
        providerEventId: fixture.refundProviderEventId,
        providerPaymentId: fixture.refundProviderPaymentId,
        providerRefundId: fixture.providerRefundId
      })
    );
    await ledger.createTransaction(
      chargebackRecordedTransaction({
        orderId: fixture.chargebackOrderId,
        astrologerUserId: fixture.astrologerUserId,
        paymentAttemptId: fixture.chargebackAttemptId,
        providerEventId: fixture.chargebackProviderEventId,
        providerPaymentId: fixture.chargebackProviderPaymentId
      })
    );

    const store = createDrizzlePaymentReversalCaseStore(runtime.database);
    const cases = await store.listCases({ limit: 10 });

    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({
      id: fixture.chargebackProviderEventId,
      type: "chargeback",
      severity: "critical",
      providerRefundId: null,
      orderId: fixture.chargebackOrderId,
      amount: { amountMinor: 50_000, currency: "RUB" },
      ledgerOperationType: "chargeback_recorded",
      walletBalance: {
        astrologerUserId: fixture.astrologerUserId,
        negativeBalance: { amountMinor: 45_000, currency: "RUB" }
      }
    });
    expect(cases[1]).toMatchObject({
      id: fixture.refundProviderEventId,
      type: "refund",
      severity: "critical",
      providerRefundId: fixture.providerRefundId,
      orderId: fixture.refundOrderId,
      amount: { amountMinor: 50_000, currency: "RUB" },
      refundStatus: "succeeded",
      ledgerOperationType: "refund_recorded"
    });

    await expect(store.listCases({ types: ["refund"], limit: 10 })).resolves.toEqual([cases[1]]);
  });
});

async function createFixture(): Promise<{
  readonly astrologerUserId: string;
  readonly clientUserId: string;
  readonly refundOrderId: string;
  readonly chargebackOrderId: string;
  readonly refundAttemptId: string;
  readonly chargebackAttemptId: string;
  readonly refundProviderPaymentId: string;
  readonly chargebackProviderPaymentId: string;
  readonly refundProviderEventId: string;
  readonly chargebackProviderEventId: string;
  readonly providerRefundId: string;
}> {
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const productId = randomUUID();
  const policyId = randomUUID();
  const refundOrderId = randomUUID();
  const chargebackOrderId = randomUUID();
  const refundAttemptId = randomUUID();
  const chargebackAttemptId = randomUUID();
  const refundProviderPaymentId = randomUUID();
  const chargebackProviderPaymentId = randomUUID();
  const refundProviderEventId = randomUUID();
  const chargebackProviderEventId = randomUUID();
  const providerRefundId = randomUUID();

  await runtime.pool.query("insert into users (id) values ($1), ($2)", [
    astrologerUserId,
    clientUserId
  ]);
  await runtime.pool.query(
    `insert into products
      (id, owner_user_id, type, status, title, price_minor, currency, execution_mode, payment_model, duration_minutes, participant_mode)
     values ($1, $2, 'single', 'active', 'Reversal case integration', 50000, 'RUB', 'live', 'once', 60, 'solo')`,
    [productId, astrologerUserId]
  );
  await runtime.pool.query(
    `insert into finance_policies
      (id, policy_version, risk_tier, hold_duration_hours, platform_fee_bps)
     values ($1, 1, 'standard', 48, 1000)`,
    [policyId]
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
      ($1, $2, $3, $4, 'refunded', 50000, 'RUB', 5000, 'RUB', 45000, 'RUB', $5, 'standard', 48, 0, 0, 1000, true),
      ($6, $2, $3, $4, 'chargeback', 50000, 'RUB', 5000, 'RUB', 45000, 'RUB', $5, 'standard', 48, 0, 0, 1000, true)`,
    [refundOrderId, clientUserId, astrologerUserId, productId, policyId, chargebackOrderId]
  );
  await runtime.pool.query(
    `insert into payment_attempts
      (id, order_id, provider, environment, status, amount_minor, currency,
       provider_payment_id, provider_checkout_id, idempotency_key, metadata)
     values
      ($1, $2, 'arc_pay', 'sandbox', 'refunded', 50000, 'RUB', $3, $4, $5, '{}'::jsonb),
      ($6, $7, 'arc_pay', 'sandbox', 'chargeback', 50000, 'RUB', $8, $9, $10, '{}'::jsonb)`,
    [
      refundAttemptId,
      refundOrderId,
      refundProviderPaymentId,
      randomUUID(),
      `checkout:${refundAttemptId}`,
      chargebackAttemptId,
      chargebackOrderId,
      chargebackProviderPaymentId,
      randomUUID(),
      `checkout:${chargebackAttemptId}`
    ]
  );
  await runtime.pool.query(
    `insert into payment_provider_events
      (id, payment_attempt_id, provider, environment, provider_webhook_id,
       provider_payment_id, type, occurred_at, received_at, payload)
     values
      ($1, $2, 'arc_pay', 'sandbox', 'wh_refund_1', $3, 'payment.refunded',
       '2026-07-26T10:00:00.000Z', '2026-07-26T10:01:00.000Z',
       jsonb_build_object('data', jsonb_build_object('refund_id', $4::text))),
      ($5, $6, 'arc_pay', 'sandbox', 'wh_chargeback_1', $7, 'payment.chargeback',
       '2026-07-26T10:02:00.000Z', '2026-07-26T10:03:00.000Z',
       jsonb_build_object('data', jsonb_build_object('payment_id', $7::text)))`,
    [
      refundProviderEventId,
      refundAttemptId,
      refundProviderPaymentId,
      providerRefundId,
      chargebackProviderEventId,
      chargebackAttemptId,
      chargebackProviderPaymentId
    ]
  );
  await runtime.pool.query(
    `insert into refunds
      (order_id, payment_attempt_id, provider_event_id, provider, environment,
       status, amount_minor, currency, reason, provider_refund_id)
     values ($1, $2, $3, 'arc_pay', 'sandbox', 'succeeded', 50000, 'RUB',
       'provider_refund', $4)`,
    [refundOrderId, refundAttemptId, refundProviderEventId, providerRefundId]
  );

  return {
    astrologerUserId,
    clientUserId,
    refundOrderId,
    chargebackOrderId,
    refundAttemptId,
    chargebackAttemptId,
    refundProviderPaymentId,
    chargebackProviderPaymentId,
    refundProviderEventId,
    chargebackProviderEventId,
    providerRefundId
  };
}

function saleCapturedTransaction(input: {
  readonly orderId: string;
  readonly astrologerUserId: string;
  readonly paymentAttemptId: string;
  readonly providerPaymentId: string;
}): CreateLedgerTransactionInput {
  return {
    operationType: "sale_captured",
    orderId: input.orderId,
    payoutRequestId: null,
    occurredAt: "2026-07-26T09:00:00.000Z",
    postedAt: "2026-07-26T09:00:00.000Z",
    metadata: {
      providerEventId: "captured-event-fixture",
      paymentAttemptId: input.paymentAttemptId,
      provider: "arc_pay",
      providerPaymentId: input.providerPaymentId,
      holdDurationHours: 48,
      holdReleaseAt: "2026-07-28T09:00:00.000Z",
      financePolicySnapshotId: "finance-policy-fixture",
      financePolicyRiskTier: "standard"
    },
    entries: [
      ledgerEntry("platform_clearing", null, "debit", 50_000),
      ledgerEntry("astrologer_pending", input.astrologerUserId, "credit", 45_000),
      ledgerEntry("platform_revenue", null, "credit", 5_000)
    ]
  };
}

function refundRecordedTransaction(input: {
  readonly orderId: string;
  readonly astrologerUserId: string;
  readonly paymentAttemptId: string;
  readonly providerEventId: string;
  readonly providerPaymentId: string;
  readonly providerRefundId: string;
}): CreateLedgerTransactionInput {
  return reversalTransaction({
    ...input,
    operationType: "refund_recorded",
    providerRefundId: input.providerRefundId,
    pendingReversalMinor: 45_000,
    negativeBalanceMinor: 0
  });
}

function chargebackRecordedTransaction(input: {
  readonly orderId: string;
  readonly astrologerUserId: string;
  readonly paymentAttemptId: string;
  readonly providerEventId: string;
  readonly providerPaymentId: string;
}): CreateLedgerTransactionInput {
  return reversalTransaction({
    ...input,
    operationType: "chargeback_recorded",
    providerRefundId: null,
    pendingReversalMinor: 0,
    negativeBalanceMinor: 45_000
  });
}

function reversalTransaction(input: {
  readonly operationType: "refund_recorded" | "chargeback_recorded";
  readonly orderId: string;
  readonly astrologerUserId: string;
  readonly paymentAttemptId: string;
  readonly providerEventId: string;
  readonly providerPaymentId: string;
  readonly providerRefundId: string | null;
  readonly pendingReversalMinor: number;
  readonly negativeBalanceMinor: number;
}): CreateLedgerTransactionInput {
  const astrologerEntries: CreateLedgerTransactionInput["entries"] = [
    ...(input.pendingReversalMinor > 0
      ? [
          ledgerEntry(
            "astrologer_pending",
            input.astrologerUserId,
            "debit",
            input.pendingReversalMinor
          )
        ]
      : []),
    ...(input.negativeBalanceMinor > 0
      ? [
          ledgerEntry(
            "astrologer_negative_balance",
            input.astrologerUserId,
            "debit",
            input.negativeBalanceMinor
          )
        ]
      : [])
  ];
  return {
    operationType: input.operationType,
    orderId: input.orderId,
    payoutRequestId: null,
    occurredAt:
      input.operationType === "chargeback_recorded"
        ? "2026-07-26T10:02:00.000Z"
        : "2026-07-26T10:00:00.000Z",
    postedAt:
      input.operationType === "chargeback_recorded"
        ? "2026-07-26T10:03:00.000Z"
        : "2026-07-26T10:01:00.000Z",
    metadata: {
      reason:
        input.operationType === "chargeback_recorded" ? "provider_chargeback" : "provider_refund",
      providerEventId: input.providerEventId,
      paymentAttemptId: input.paymentAttemptId,
      provider: "arc_pay",
      providerPaymentId: input.providerPaymentId,
      providerRefundId: input.providerRefundId,
      reversalGrossAmountMinor: 50_000,
      platformFeeReversalAmountMinor: 5_000,
      astrologerShareReversalAmountMinor: 45_000,
      financePolicySnapshotId: "finance-policy-fixture",
      financePolicyRiskTier: "standard"
    },
    entries: [
      ledgerEntry("platform_revenue", null, "debit", 5_000),
      ...astrologerEntries,
      ledgerEntry("platform_clearing", null, "credit", 50_000)
    ]
  };
}

function ledgerEntry(
  accountType: CreateLedgerTransactionInput["entries"][number]["account"]["accountType"],
  astrologerUserId: string | null,
  side: CreateLedgerTransactionInput["entries"][number]["side"],
  amountMinor: number
): CreateLedgerTransactionInput["entries"][number] {
  return {
    account: { accountType, astrologerUserId, currency: "RUB" },
    side,
    amount: { amountMinor, currency: "RUB" },
    metadata: {}
  };
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
