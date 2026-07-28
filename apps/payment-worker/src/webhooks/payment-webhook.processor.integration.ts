import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDrizzleCapturedSaleUnitOfWork,
  createDrizzleLedgerStore,
  createDrizzleOrderStore,
  createDrizzlePaymentReversalUnitOfWork,
  createDrizzlePaymentStore,
  createDrizzleReconciliationStore,
  createDrizzleTerminalPaymentUnitOfWork
} from "@elevenhouse/db/finance";
import { assertDevelopmentDatabaseUrl } from "@elevenhouse/db/connection";
import { createPostgresRuntime, type PostgresRuntime } from "@elevenhouse/db/runtime";
import type { CreateLedgerTransactionInput } from "@elevenhouse/domain";
import { Client } from "pg";
import { createPaymentWebhookHandler } from "./payment-webhook.server";
import { createPaymentWebhookProcessor } from "./payment-webhook.processor";

const webhookSecret = "arc-pay-webhook-secret";
const now = new Date("2026-07-26T12:00:00.000Z");
const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_payment_reversals_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;

describe("Arc Pay refund and chargeback webhook PostgreSQL integration", () => {
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

  it("records a full refund webhook against pending astrologer funds exactly once", async () => {
    const fixture = await createFixture({ orderStatus: "paid" });
    const ledger = createDrizzleLedgerStore(runtime.database);
    await ledger.createTransaction(
      saleCapturedTransaction({
        orderId: fixture.orderId,
        astrologerUserId: fixture.astrologerUserId,
        paymentAttemptId: fixture.paymentAttemptId,
        providerPaymentId: fixture.providerPaymentId
      })
    );
    const handler = createHandler(fixture.paymentAttemptId);
    const request = signedRequest(
      refundPayload({
        eventId: randomUUID(),
        providerPaymentId: fixture.providerPaymentId,
        providerRefundId: randomUUID(),
        refundAmountMinor: 50_000,
        totalRefundedMinor: 50_000
      })
    );

    await expect(handler.handle(request)).resolves.toEqual({
      statusCode: 200,
      body: { accepted: true, duplicate: false }
    });
    await expect(handler.handle(request)).resolves.toEqual({
      statusCode: 200,
      body: { accepted: true, duplicate: true }
    });

    await expect(financeState(fixture.orderId, fixture.astrologerUserId)).resolves.toEqual({
      orderStatus: "refunded",
      refunds: [{ amountMinor: 50_000, status: "succeeded" }],
      ledgerOperations: { refund_recorded: "1" },
      payoutRequests: [],
      wallet: {
        pending: "0",
        available: "0",
        reserved: "0",
        payoutPending: "0",
        negativeBalance: "0"
      }
    });
  });

  it("records a partial refund webhook against available funds and dedupes provider refund id", async () => {
    const fixture = await createFixture({ orderStatus: "fulfilled" });
    const ledger = createDrizzleLedgerStore(runtime.database);
    await ledger.createTransaction(
      saleCapturedTransaction({
        orderId: fixture.orderId,
        astrologerUserId: fixture.astrologerUserId,
        paymentAttemptId: fixture.paymentAttemptId,
        providerPaymentId: fixture.providerPaymentId
      })
    );
    await ledger.createTransaction(
      holdReleaseTransaction({
        orderId: fixture.orderId,
        astrologerUserId: fixture.astrologerUserId,
        paymentAttemptId: fixture.paymentAttemptId
      })
    );
    const providerRefundId = randomUUID();
    const handler = createHandler(fixture.paymentAttemptId);

    await expect(
      handler.handle(
        signedRequest(
          refundPayload({
            eventId: randomUUID(),
            providerPaymentId: fixture.providerPaymentId,
            providerRefundId,
            refundAmountMinor: 10_000,
            totalRefundedMinor: 10_000
          })
        )
      )
    ).resolves.toEqual({ statusCode: 200, body: { accepted: true, duplicate: false } });
    await expect(
      handler.handle(
        signedRequest(
          refundPayload({
            eventId: randomUUID(),
            providerPaymentId: fixture.providerPaymentId,
            providerRefundId,
            refundAmountMinor: 10_000,
            totalRefundedMinor: 10_000
          })
        )
      )
    ).resolves.toEqual({ statusCode: 200, body: { accepted: true, duplicate: true } });

    await expect(financeState(fixture.orderId, fixture.astrologerUserId)).resolves.toEqual({
      orderStatus: "partially_refunded",
      refunds: [{ amountMinor: 10_000, status: "succeeded" }],
      ledgerOperations: { refund_recorded: "1" },
      payoutRequests: [],
      wallet: {
        pending: "0",
        available: "36000",
        reserved: "0",
        payoutPending: "0",
        negativeBalance: "0"
      }
    });
  });

  it("records a chargeback shortfall as negative balance without a refund row", async () => {
    const fixture = await createFixture({ orderStatus: "fulfilled" });
    const handler = createHandler(fixture.paymentAttemptId);

    await expect(
      handler.handle(
        signedRequest({
          ...basePayload(randomUUID(), fixture.providerPaymentId),
          event_type: "payment.chargeback",
          data: {
            payment_id: fixture.providerPaymentId,
            amount: 50_000,
            currency: "RUB"
          }
        })
      )
    ).resolves.toEqual({ statusCode: 200, body: { accepted: true, duplicate: false } });

    await expect(financeState(fixture.orderId, fixture.astrologerUserId)).resolves.toEqual({
      orderStatus: "chargeback",
      refunds: [],
      ledgerOperations: { chargeback_recorded: "1" },
      payoutRequests: [],
      wallet: {
        pending: "0",
        available: "0",
        reserved: "0",
        payoutPending: "0",
        negativeBalance: "45000"
      }
    });
  });

  it("claws a chargeback from payout pending and blocks an open manual payout request", async () => {
    const fixture = await createFixture({ orderStatus: "fulfilled" });
    const ledger = createDrizzleLedgerStore(runtime.database);
    await ledger.createTransaction(
      saleCapturedTransaction({
        orderId: fixture.orderId,
        astrologerUserId: fixture.astrologerUserId,
        paymentAttemptId: fixture.paymentAttemptId,
        providerPaymentId: fixture.providerPaymentId
      })
    );
    await ledger.createTransaction(
      holdReleaseTransaction({
        orderId: fixture.orderId,
        astrologerUserId: fixture.astrologerUserId,
        paymentAttemptId: fixture.paymentAttemptId
      })
    );
    const payoutRequestId = await createApprovedPayoutRequest({
      astrologerUserId: fixture.astrologerUserId,
      amountMinor: 45_000
    });
    await ledger.createTransaction(
      payoutReservedTransaction({
        payoutRequestId,
        astrologerUserId: fixture.astrologerUserId,
        amountMinor: 45_000
      })
    );
    const handler = createHandler(fixture.paymentAttemptId);

    await expect(
      handler.handle(
        signedRequest({
          ...basePayload(randomUUID(), fixture.providerPaymentId),
          event_type: "payment.chargeback",
          data: {
            payment_id: fixture.providerPaymentId,
            amount: 50_000,
            currency: "RUB"
          }
        })
      )
    ).resolves.toEqual({ statusCode: 200, body: { accepted: true, duplicate: false } });

    await expect(financeState(fixture.orderId, fixture.astrologerUserId)).resolves.toEqual({
      orderStatus: "chargeback",
      refunds: [],
      ledgerOperations: { chargeback_recorded: "1", payout_failed: "1" },
      payoutRequests: [
        expect.objectContaining({
          id: payoutRequestId,
          status: "cancelled",
          adminUserId: null,
          adminNote: expect.stringContaining("provider chargeback"),
          failureReason: null
        })
      ],
      wallet: {
        pending: "0",
        available: "0",
        reserved: "0",
        payoutPending: "0",
        negativeBalance: "0"
      }
    });
  });
});

function createHandler(paymentAttemptId: string) {
  const paymentStore = createDrizzlePaymentStore(runtime.database);
  return createPaymentWebhookHandler({
    webhookSecret,
    timestampToleranceSeconds: 300,
    now: () => now,
    processor: createPaymentWebhookProcessor({
      paymentStore,
      orderStore: createDrizzleOrderStore(runtime.database),
      capturedSale: createDrizzleCapturedSaleUnitOfWork(runtime.database),
      terminalPayment: createDrizzleTerminalPaymentUnitOfWork(runtime.database),
      reversal: createDrizzlePaymentReversalUnitOfWork(runtime.database),
      reconciliationStore: createDrizzleReconciliationStore(runtime.database),
      resolvePaymentAttemptId: async () => paymentAttemptId,
      now: () => now
    })
  });
}

async function createFixture(input: { readonly orderStatus: "paid" | "fulfilled" }): Promise<{
  readonly astrologerUserId: string;
  readonly orderId: string;
  readonly paymentAttemptId: string;
  readonly providerPaymentId: string;
}> {
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const productId = randomUUID();
  const policyId = await ensureFinancePolicy();
  const orderId = randomUUID();
  const paymentAttemptId = randomUUID();
  const providerPaymentId = randomUUID();

  await runtime.pool.query("insert into users (id) values ($1), ($2)", [
    astrologerUserId,
    clientUserId
  ]);
  await runtime.pool.query(
    `insert into products
      (id, owner_user_id, type, status, title, price_minor, currency, execution_mode,
       payment_model, duration_minutes, participant_mode)
     values ($1, $2, 'single', 'active', 'Payment reversal integration', 50000,
       'RUB', 'live', 'once', 60, 'solo')`,
    [productId, astrologerUserId]
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
      ($1, $2, $3, $4, $5, 50000, 'RUB', 5000, 'RUB', 45000, 'RUB',
       $6, 'standard', 48, 0, 0, 1000, true)`,
    [orderId, clientUserId, astrologerUserId, productId, input.orderStatus, policyId]
  );
  await runtime.pool.query(
    `insert into payment_attempts
      (id, order_id, provider, environment, status, amount_minor, currency,
       provider_payment_id, provider_checkout_id, idempotency_key, metadata)
     values ($1, $2, 'arc_pay', 'sandbox', 'captured', 50000, 'RUB',
       null, $3, $4, '{}'::jsonb)`,
    [paymentAttemptId, orderId, randomUUID(), `checkout:${paymentAttemptId}`]
  );

  return { astrologerUserId, orderId, paymentAttemptId, providerPaymentId };
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
    occurredAt: "2026-07-26T10:00:00.000Z",
    postedAt: "2026-07-26T10:00:00.000Z",
    metadata: {
      providerEventId: "captured-event-fixture",
      paymentAttemptId: input.paymentAttemptId,
      provider: "arc_pay",
      providerPaymentId: input.providerPaymentId,
      holdDurationHours: 48,
      holdReleaseAt: "2026-07-28T10:00:00.000Z",
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

function holdReleaseTransaction(input: {
  readonly orderId: string;
  readonly astrologerUserId: string;
  readonly paymentAttemptId: string;
}): CreateLedgerTransactionInput {
  return {
    operationType: "funds_released",
    orderId: input.orderId,
    payoutRequestId: null,
    occurredAt: "2026-07-29T10:00:00.000Z",
    postedAt: "2026-07-29T10:00:00.000Z",
    metadata: {
      reason: "captured_sale_hold_elapsed",
      holdReleaseAt: "2026-07-28T10:00:00.000Z",
      providerEventId: "captured-event-fixture",
      paymentAttemptId: input.paymentAttemptId
    },
    entries: [
      ledgerEntry("astrologer_pending", input.astrologerUserId, "debit", 45_000),
      ledgerEntry("astrologer_available", input.astrologerUserId, "credit", 45_000)
    ]
  };
}

function payoutReservedTransaction(input: {
  readonly payoutRequestId: string;
  readonly astrologerUserId: string;
  readonly amountMinor: number;
}): CreateLedgerTransactionInput {
  return {
    operationType: "payout_reserved",
    orderId: null,
    payoutRequestId: input.payoutRequestId,
    occurredAt: "2026-07-29T11:00:00.000Z",
    postedAt: "2026-07-29T11:00:00.000Z",
    metadata: { payoutRequestId: input.payoutRequestId },
    entries: [
      ledgerEntry("astrologer_available", input.astrologerUserId, "debit", input.amountMinor),
      ledgerEntry("astrologer_payout_pending", input.astrologerUserId, "credit", input.amountMinor)
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

function refundPayload(input: {
  readonly eventId: string;
  readonly providerPaymentId: string;
  readonly providerRefundId: string;
  readonly refundAmountMinor: number;
  readonly totalRefundedMinor: number;
}) {
  return {
    ...basePayload(input.eventId, input.providerPaymentId),
    event_type: "payment.refunded",
    data: {
      payment_id: input.providerPaymentId,
      refund_id: input.providerRefundId,
      refund_amount: input.refundAmountMinor,
      total_refunded: input.totalRefundedMinor,
      currency: "RUB"
    }
  };
}

function basePayload(eventId: string, providerPaymentId: string) {
  return {
    event_id: eventId,
    created_at: now.toISOString(),
    tenant_id: randomUUID(),
    environment: "sandbox",
    livemode: false,
    data: { payment_id: providerPaymentId }
  };
}

function signedRequest(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const webhookId = String(payload.event_id);
  const signature = createHmac("sha256", webhookSecret)
    .update(`${webhookId}.${timestamp}.${rawBody}`)
    .digest("hex");
  return {
    headers: {
      "webhook-id": webhookId,
      "webhook-attempt": "1",
      "webhook-timestamp": timestamp,
      "webhook-signature": `t=${timestamp},v1=${signature}`
    },
    rawBody
  };
}

async function financeState(orderId: string, astrologerUserId: string) {
  const [order, refunds, ledgerOperations, wallet, payoutRequests] = await Promise.all([
    runtime.pool.query<{ status: string }>("select status from orders where id = $1", [orderId]),
    runtime.pool.query<{ amount_minor: string; status: string }>(
      "select amount_minor::text, status from refunds where order_id = $1 order by created_at, id",
      [orderId]
    ),
    runtime.pool.query<{ operation_type: string; count: string }>(
      `select operation_type, count(*)::text as count
       from ledger_transactions
       where (order_id = $1 or payout_request_id in (
         select id from payout_requests where astrologer_user_id = $2
       ))
         and operation_type in ('refund_recorded', 'chargeback_recorded', 'payout_failed')
       group by operation_type`,
      [orderId, astrologerUserId]
    ),
    runtime.pool.query<{
      pending_amount_minor: string;
      available_amount_minor: string;
      reserved_amount_minor: string;
      payout_pending_amount_minor: string;
      negative_balance_amount_minor: string;
    }>(
      `select pending_amount_minor::text, available_amount_minor::text,
        reserved_amount_minor::text, payout_pending_amount_minor::text,
        negative_balance_amount_minor::text
       from wallet_balance_read_models
       where astrologer_user_id = $1`,
      [astrologerUserId]
    ),
    runtime.pool.query<{
      id: string;
      status: string;
      admin_user_id: string | null;
      admin_note: string | null;
      failure_reason: string | null;
    }>(
      `select id, status, admin_user_id, admin_note, failure_reason
       from payout_requests
       where astrologer_user_id = $1
       order by requested_at, id`,
      [astrologerUserId]
    )
  ]);
  return {
    orderStatus: order.rows[0]?.status,
    refunds: refunds.rows.map((refund) => ({
      amountMinor: Number(refund.amount_minor),
      status: refund.status
    })),
    ledgerOperations: Object.fromEntries(
      ledgerOperations.rows.map((row) => [row.operation_type, row.count])
    ),
    payoutRequests: payoutRequests.rows.map((request) => ({
      id: request.id,
      status: request.status,
      adminUserId: request.admin_user_id,
      adminNote: request.admin_note,
      failureReason: request.failure_reason
    })),
    wallet: {
      pending: wallet.rows[0]?.pending_amount_minor ?? "0",
      available: wallet.rows[0]?.available_amount_minor ?? "0",
      reserved: wallet.rows[0]?.reserved_amount_minor ?? "0",
      payoutPending: wallet.rows[0]?.payout_pending_amount_minor ?? "0",
      negativeBalance: wallet.rows[0]?.negative_balance_amount_minor ?? "0"
    }
  };
}

async function createApprovedPayoutRequest(input: {
  readonly astrologerUserId: string;
  readonly amountMinor: number;
}): Promise<string> {
  const payoutMethodId = randomUUID();
  const payoutRequestId = randomUUID();
  await runtime.pool.query(
    `insert into payout_methods
      (id, astrologer_user_id, method, currency, display_name, manual_bank_transfer_details, is_default)
     values ($1, $2, 'manual_bank_transfer', 'RUB', 'Main account', '{"bankName":"T-Bank"}'::jsonb, true)`,
    [payoutMethodId, input.astrologerUserId]
  );
  await runtime.pool.query(
    `insert into payout_requests
      (id, astrologer_user_id, payout_method_id, status, amount_minor, currency, method,
       requested_at, reviewed_at, metadata)
     values ($1, $2, $3, 'approved', $4, 'RUB', 'manual_bank_transfer',
       '2026-07-29T10:30:00.000Z', '2026-07-29T10:45:00.000Z', '{}'::jsonb)`,
    [payoutRequestId, input.astrologerUserId, payoutMethodId, input.amountMinor]
  );
  return payoutRequestId;
}

let policyVersion = 0;
let sharedPolicyId: string | null = null;

async function ensureFinancePolicy(): Promise<string> {
  if (sharedPolicyId) return sharedPolicyId;
  sharedPolicyId = randomUUID();
  await runtime.pool.query(
    `insert into finance_policies
      (id, policy_version, risk_tier, hold_duration_hours, platform_fee_bps)
     values ($1, $2, 'standard', 48, 1000)`,
    [sharedPolicyId, uniquePolicyVersion()]
  );
  return sharedPolicyId;
}

function uniquePolicyVersion(): number {
  policyVersion += 1;
  return policyVersion;
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
