import { readCurrentMigrationSql } from "../testing/current-migration-sql";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { assertDevelopmentDatabaseUrl } from "../connection";
import { createDrizzleLedgerStore } from "../adapters/finance/drizzle-ledger-store";
import { createFinanceArtifactRegistry } from "../adapters/finance/finance-artifact-registry";
import { createPostgresRuntime, type PostgresRuntime } from "../runtime";
import { financeArtifactRetentionPolicies } from "../schema/finance/finance-artifacts.schema";
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
    await runtime.pool.query(readCurrentMigrationSql());
    await runtime.database.insert(financeArtifactRetentionPolicies).values({
      policyId: "manual-payout-proof",
      policyVersion: "1",
      artifactClass: "bank_transfer_evidence",
      retainForSeconds: "315360000",
      authorityRef: "test-manual-payout-proof-policy",
      effectiveAt: new Date("2020-01-01T00:00:00.000Z")
    });
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
    const csrfNow = new Date("2026-07-28T10:00:00.000Z");
    const first = await seedAdminFinanceBrowserFixture(runtime, { csrfNow });
    const second = await seedAdminFinanceBrowserFixture(runtime, { csrfNow });

    expect(second).toEqual(first);
    expect(first.sessionCookie).toBe(`elevenhouse_admin_session=${first.sessionToken}`);
    expect(first.astrologerSessionCookie).toBe(
      `elevenhouse_astrologer_session=${first.astrologerSessionToken}`
    );
    expect(first.astrologerCsrfCookieName).toBe("elevenhouse_astrologer_csrf");
    expect(first.astrologerCsrfHeaderName).toBe("x-csrf-token");
    expect(first.astrologerCsrfToken).toMatch(/^v1\.\d+\.elevenhouse-dev-admin-finance-csrf\./);
    expect(first.astrologerCsrfCookie).toBe(
      `elevenhouse_astrologer_csrf=${first.astrologerCsrfToken}`
    );
    expect(first.csrfCookieName).toBe("elevenhouse_admin_csrf");
    expect(first.csrfHeaderName).toBe("x-csrf-token");
    expect(first.csrfToken).toMatch(/^v1\.\d+\.elevenhouse-dev-admin-finance-csrf\./);
    expect(first.csrfCookie).toBe(`elevenhouse_admin_csrf=${first.csrfToken}`);
    expect(first.browserConsoleHelper).toContain(first.sessionCookie);
    expect(first.browserConsoleHelper).toContain(first.csrfCookie);
    expect(first.astrologerBrowserConsoleHelper).toContain(first.astrologerSessionCookie);
    expect(first.astrologerBrowserConsoleHelper).toContain(first.astrologerCsrfCookie);

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

    const astrologerSession = await runtime.pool.query<{
      readonly status: string;
      readonly role: string;
      readonly token_hash: string;
    }>(
      `select sessions.status, roles.role, sessions.token_hash
       from user_sessions sessions
       inner join user_role_assignments roles on roles.user_id = sessions.user_id
       where sessions.user_id = $1`,
      [first.astrologerUserId]
    );
    expect(astrologerSession.rows).toEqual([
      {
        status: "active",
        role: "astrologer",
        token_hash: first.astrologerSessionTokenHash
      }
    ]);

    const browserClient = await runtime.pool.query<{
      readonly relationship_status: string;
      readonly birth_date: string | null;
    }>(
      `select relationships.status as relationship_status, birth.birth_date
       from client_astrologer_relationships relationships
       inner join client_birth_data birth on birth.client_user_id = relationships.client_user_id
       where relationships.astrologer_user_id = $1
       order by relationships.client_user_id`,
      [first.astrologerUserId]
    );
    expect(browserClient.rows).toEqual([{ relationship_status: "active", birth_date: "1990-03-14" }]);

    const policies = await runtime.pool.query<{ readonly count: string }>(
      "select count(*)::text from finance_policies where is_active = true and risk_tier = 'manual_review'"
    );
    expect(policies.rows[0]?.count).toBe("1");

    const captureAuthorities = await runtime.pool.query<{
      readonly policy_id: string;
      readonly policy_version: string;
      readonly effective_risk_tier: string;
      readonly registry_key: string;
      readonly registry_revision: string;
    }>(
      `select risk.policy_id,
              risk.policy_version::text,
              risk.effective_risk_tier,
              fulfillment.registry_key,
              fulfillment.registry_revision::text
       from finance_risk_policy_versions risk
       cross join finance_paid_product_fulfillment_decisions fulfillment
       where risk.policy_id = '10000000-0000-4000-8000-000000000007'
         and risk.policy_version = 970001
         and fulfillment.registry_key = 'single.once.live.solo'
         and fulfillment.registry_revision = 1`
    );
    expect(captureAuthorities.rows).toEqual([
      {
        policy_id: "10000000-0000-4000-8000-000000000007",
        policy_version: "970001",
        effective_risk_tier: "manual_review",
        registry_key: "single.once.live.solo",
        registry_revision: "1"
      }
    ]);

    const deliveryFormats = await runtime.pool.query<{ readonly value: string }>(
      `select value
       from product_delivery_formats
       where product_id = $1
       order by "order"`,
      ["10000000-0000-4000-8000-000000000006"]
    );
    expect(deliveryFormats.rows).toEqual([{ value: "video" }]);

    const commissionSnapshots = await runtime.pool.query<{
      readonly order_count: string;
      readonly tariff_series_id: string;
      readonly tariff_version: number;
      readonly tariff_commission_bps: number;
      readonly published_commission_bps: number;
    }>(
      `select count(*)::text as order_count,
              orders.tariff_series_id,
              orders.tariff_version,
              orders.tariff_commission_bps,
              tariffs.client_sale_commission_bps as published_commission_bps
       from orders
       inner join platform_tariff_versions tariffs
         on tariffs.tariff_series_id = orders.tariff_series_id
        and tariffs.version = orders.tariff_version
        and tariffs.canonical_digest = orders.tariff_version_digest
       where orders.astrologer_user_id = $1
       group by orders.tariff_series_id, orders.tariff_version,
                orders.tariff_commission_bps, tariffs.client_sale_commission_bps`,
      [first.astrologerUserId]
    );
    expect(commissionSnapshots.rows).toEqual([
      {
        order_count: "4",
        tariff_series_id: "dev-finance-pro",
        tariff_version: 1,
        tariff_commission_bps: 800,
        published_commission_bps: 800
      }
    ]);

    const capabilities = await runtime.pool.query<{ readonly capability: string }>(
      `select capability
       from platform_tariff_version_capabilities
       where tariff_series_id = 'dev-finance-pro' and tariff_version = 1
       order by capability`
    );
    expect(capabilities.rows).toEqual([{ capability: "funnels" }, { capability: "products" }]);

    const ledgerStore = createDrizzleLedgerStore(runtime.database);
    await expect(
      ledgerStore.summarizePeriod({
        astrologerUserId: first.astrologerUserId,
        periodStart: "2026-07-01T00:00:00.000Z",
        periodEndExclusive: "2026-08-01T00:00:00.000Z"
      })
    ).resolves.toMatchObject({
      grossSalesAmount: { amountMinor: 28_450_000, currency: "RUB" },
      platformFeeAmount: { amountMinor: 2_276_000, currency: "RUB" },
      netSalesAmount: { amountMinor: 26_174_000, currency: "RUB" },
      refundsAmount: { amountMinor: 46_000, currency: "RUB" },
      payoutsAmount: { amountMinor: 0, currency: "RUB" },
      saleCount: 3,
      refundCount: 1,
      payoutCount: 0
    });

    const wallet = await runtime.pool.query<{
      readonly pending_amount_minor: string;
      readonly available_amount_minor: string;
      readonly reserved_amount_minor: string;
      readonly payout_pending_amount_minor: string;
      readonly negative_balance_amount_minor: string;
    }>(
      `select pending_amount_minor::text,
              available_amount_minor::text,
              reserved_amount_minor::text,
              payout_pending_amount_minor::text,
              negative_balance_amount_minor::text
       from wallet_balance_read_models
       where astrologer_user_id = $1`,
      [first.astrologerUserId]
    );
    expect(wallet.rows).toEqual([
      {
        pending_amount_minor: "4094000",
        available_amount_minor: "19534000",
        reserved_amount_minor: "0",
        payout_pending_amount_minor: "2500000",
        negative_balance_amount_minor: "0"
      }
    ]);

    const payouts = await runtime.pool.query<{
      readonly id: string;
      readonly status: string;
      readonly amount_minor: string;
      readonly failure_reason: string | null;
      readonly external_reference: string | null;
    }>(
      `select id, status, amount_minor::text, failure_reason, external_reference
       from payout_requests
       where astrologer_user_id = $1
       order by requested_at desc, id desc`,
      [first.astrologerUserId]
    );
    expect(payouts.rows).toEqual([
      {
        id: first.chargebackBlockedPayoutRequestId,
        status: "cancelled",
        amount_minor: "46000",
        failure_reason: "Provider chargeback blocked payout before paid confirmation",
        external_reference: null
      },
      {
        id: first.processingPayoutRequestId,
        status: "processing_manual",
        amount_minor: "1500000",
        failure_reason: null,
        external_reference: null
      },
      {
        id: first.openPayoutRequestId,
        status: "requested",
        amount_minor: "1000000",
        failure_reason: null,
        external_reference: null
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

    await insertCompletedPayoutMutation(runtime, first);

    const recovered = await seedAdminFinanceBrowserFixture(runtime, { csrfNow });
    expect(recovered).toEqual(first);

    const recoveredProcessingPayout = await runtime.pool.query<{
      readonly status: string;
      readonly external_reference: string | null;
    }>("select status, external_reference from payout_requests where id = $1", [
      first.processingPayoutRequestId
    ]);
    expect(recoveredProcessingPayout.rows).toEqual([
      { status: "processing_manual", external_reference: null }
    ]);

    const leftoverMutationCommands = await runtime.pool.query<{ readonly count: string }>(
      `select count(*)::text
       from finance_idempotency_commands
       where scope in (
         'admin.finance.payout-status.terminal',
         'admin.finance.payment-reversal-review'
       )
         and idempotency_key like '10000000-0000-4000-8000-0000000000%:%'`
    );
    expect(leftoverMutationCommands.rows[0]?.count).toBe("0");
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

async function insertCompletedPayoutMutation(
  runtime: PostgresRuntime,
  fixture: {
    readonly adminUserId: string;
    readonly astrologerUserId: string;
    readonly processingPayoutRequestId: string;
  }
): Promise<void> {
  const accounts = await runtime.pool.query<{ readonly id: string; readonly account_type: string }>(
    `select id, account_type
     from ledger_accounts
     where currency = 'RUB'
       and (
         account_type = 'platform_clearing'
         or (account_type = 'astrologer_payout_pending' and astrologer_user_id = $1)
       )`,
    [fixture.astrologerUserId]
  );
  const payoutPendingAccountId = accounts.rows.find(
    (account) => account.account_type === "astrologer_payout_pending"
  )?.id;
  const platformClearingAccountId = accounts.rows.find(
    (account) => account.account_type === "platform_clearing"
  )?.id;
  if (!payoutPendingAccountId || !platformClearingAccountId) {
    throw new Error("Expected seeded ledger accounts before mutation simulation");
  }

  const mutationLedgerTransactionId = randomUUID();
  const proofArtifactId = `admin-finance-fixture-reseed-proof:${randomUUID()}`;
  const proofDigest = `sha256:${createHash("sha256").update(proofArtifactId).digest("hex")}` as const;
  const proofByteLength = 1_024;
  const proof = await createFinanceArtifactRegistry(runtime.database).registerSealedArtifact({
    artifact: {
      artifactId: proofArtifactId,
      sha256Digest: proofDigest,
      byteLength: proofByteLength,
      bankCashPoolId: "manual-payout-bank-cash-pool",
      statementSourceFingerprint:
        "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    },
    artifactClass: "bank_transfer_evidence",
    binding: {
      kind: "bank_cash_pool",
      bankCashPoolId: "manual-payout-bank-cash-pool",
      currency: "RUB"
    },
    contentType: "application/pdf",
    privateObject: {
      privateObjectKey: `private/manual-payout-proofs/${proofArtifactId}`,
      privateObjectVersion: "immutable-version-1",
      envelopeKeyVersion: "kms-finance-v1",
      sha256Digest: proofDigest,
      byteLength: proofByteLength,
      contentType: "application/pdf"
    },
    retentionPolicyId: "manual-payout-proof",
    retentionPolicyVersion: "1"
  });
  if (!("bankCashPoolId" in proof)) {
    throw new Error("Expected bank-bound payout proof artifact");
  }
  await runtime.pool.query(
    `insert into ledger_transactions
       (id, operation_type, payout_request_id, occurred_at, posted_at, metadata)
     values ($1, 'payout_paid', $2, '2026-07-28T10:30:00.000Z', '2026-07-28T10:30:00.000Z',
       jsonb_build_object('source', 'admin-finance-fixture-reseed-test'))`,
    [mutationLedgerTransactionId, fixture.processingPayoutRequestId]
  );
  await runtime.pool.query(
    `insert into ledger_entries
       (ledger_transaction_id, account_id, entry_side, amount_minor, currency, metadata, created_at)
     values
       ($1, $2, 'debit', 1500000, 'RUB',
        jsonb_build_object('source', 'admin-finance-fixture-reseed-test'),
        '2026-07-28T10:30:00.000Z'),
       ($1, $3, 'credit', 1500000, 'RUB',
        jsonb_build_object('source', 'admin-finance-fixture-reseed-test'),
        '2026-07-28T10:30:00.000Z')`,
    [mutationLedgerTransactionId, payoutPendingAccountId, platformClearingAccountId]
  );
  await runtime.pool.query(
    `insert into finance_idempotency_commands
       (scope, idempotency_key, actor_user_id, request_hash, state, result, expires_at, created_at, updated_at)
     values (
       'admin.finance.payout-status.terminal',
       $1,
       $2,
       'sha256:0000000000000000000000000000000000000000000000000000000000000000',
       'completed',
       jsonb_build_object('payoutRequestId', $3::text),
       '2026-10-26T10:30:00.000Z',
       '2026-07-28T10:30:00.000Z',
       '2026-07-28T10:30:00.000Z'
     )`,
    [
      `${fixture.processingPayoutRequestId}:terminal`,
      fixture.adminUserId,
      fixture.processingPayoutRequestId
    ]
  );
  await runtime.pool.query(
    `update payout_requests
     set status = 'paid',
         external_reference = 'bank-transfer-reseed-test',
         transferred_at = '2026-07-28T10:30:00.000Z',
         paid_proof_artifact_id = $2,
         paid_proof_artifact_digest = $3,
         paid_proof_artifact_byte_length = $4,
         completed_at = '2026-07-28T10:30:00.000Z',
         updated_at = '2026-07-28T10:30:00.000Z'
     where id = $1`,
    [
      fixture.processingPayoutRequestId,
      proof.artifactId,
      proof.sha256Digest,
      proof.byteLength
    ]
  );
}
