import { createHmac } from "node:crypto";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { hashSessionToken } from "@elevenhouse/auth";
import type { PostgresRuntime } from "../runtime";

export type AdminFinanceBrowserFixtureOptions = {
  readonly sessionCookieName?: string;
  readonly astrologerSessionCookieName?: string;
  readonly csrfCookieName?: string;
  readonly csrfHeaderName?: string;
  readonly csrfSecret?: string;
  readonly csrfTokenTtlSeconds?: number;
  readonly csrfNow?: Date;
};

export type AdminFinanceBrowserFixtureResult = {
  readonly adminUserId: string;
  readonly astrologerUserId: string;
  readonly sessionToken: string;
  readonly sessionTokenHash: string;
  readonly sessionCookieName: string;
  readonly sessionCookie: string;
  readonly astrologerSessionToken: string;
  readonly astrologerSessionTokenHash: string;
  readonly astrologerSessionCookieName: string;
  readonly astrologerSessionCookie: string;
  readonly csrfCookieName: string;
  readonly csrfHeaderName: string;
  readonly csrfToken: string;
  readonly csrfCookie: string;
  readonly browserConsoleHelper: string;
  readonly astrologerBrowserConsoleHelper: string;
  readonly openPayoutRequestId: string;
  readonly processingPayoutRequestId: string;
  readonly chargebackBlockedPayoutRequestId: string;
  readonly chargebackProviderEventId: string;
  readonly reconciliationExceptionId: string;
};

const fixture = {
  adminUserId: "10000000-0000-4000-8000-000000000001",
  astrologerUserId: "10000000-0000-4000-8000-000000000002",
  clientUserId: "10000000-0000-4000-8000-000000000003",
  sessionId: "10000000-0000-4000-8000-000000000004",
  authSecurityEventId: "10000000-0000-4000-8000-000000000005",
  productId: "10000000-0000-4000-8000-000000000006",
  financePolicyId: "10000000-0000-4000-8000-000000000007",
  payoutMethodId: "10000000-0000-4000-8000-000000000008",
  openPayoutRequestId: "10000000-0000-4000-8000-000000000009",
  chargebackBlockedPayoutRequestId: "10000000-0000-4000-8000-000000000010",
  chargebackOrderId: "10000000-0000-4000-8000-000000000011",
  chargebackPaymentAttemptId: "10000000-0000-4000-8000-000000000012",
  chargebackProviderEventId: "10000000-0000-4000-8000-000000000013",
  reconciliationExceptionId: "10000000-0000-4000-8000-000000000014",
  fundingLedgerTransactionId: "10000000-0000-4000-8000-000000000015",
  openPayoutReservedLedgerTransactionId: "10000000-0000-4000-8000-000000000016",
  blockedPayoutReservedLedgerTransactionId: "10000000-0000-4000-8000-000000000017",
  blockedPayoutFailedLedgerTransactionId: "10000000-0000-4000-8000-000000000018",
  chargebackLedgerTransactionId: "10000000-0000-4000-8000-000000000019",
  processingPayoutRequestId: "10000000-0000-4000-8000-000000000020",
  processingPayoutReservedLedgerTransactionId: "10000000-0000-4000-8000-000000000021",
  capturedSaleOrderIdA: "10000000-0000-4000-8000-000000000022",
  capturedSalePaymentAttemptIdA: "10000000-0000-4000-8000-000000000023",
  capturedSaleProviderEventIdA: "10000000-0000-4000-8000-000000000024",
  capturedSaleLedgerTransactionIdA: "10000000-0000-4000-8000-000000000025",
  capturedSaleReleaseLedgerTransactionIdA: "10000000-0000-4000-8000-000000000026",
  capturedSaleOrderIdB: "10000000-0000-4000-8000-000000000027",
  capturedSalePaymentAttemptIdB: "10000000-0000-4000-8000-000000000028",
  capturedSaleProviderEventIdB: "10000000-0000-4000-8000-000000000029",
  capturedSaleLedgerTransactionIdB: "10000000-0000-4000-8000-000000000030",
  capturedSaleReleaseLedgerTransactionIdB: "10000000-0000-4000-8000-000000000031",
  pendingSaleOrderId: "10000000-0000-4000-8000-000000000032",
  pendingSalePaymentAttemptId: "10000000-0000-4000-8000-000000000033",
  pendingSaleProviderEventId: "10000000-0000-4000-8000-000000000034",
  pendingSaleLedgerTransactionId: "10000000-0000-4000-8000-000000000035",
  astrologerSessionId: "10000000-0000-4000-8000-000000000036",
  astrologerAuthSecurityEventId: "10000000-0000-4000-8000-000000000037",
  sessionToken: "elevenhouse-dev-admin-finance-session-token",
  astrologerSessionToken: "elevenhouse-dev-astrologer-finance-session-token"
} as const;

const now = "2026-07-28T10:00:00.000Z";
const sessionExpiresAt = "2099-01-01T00:00:00.000Z";
const defaultSessionCookieName = "elevenhouse_admin_session";
const defaultAstrologerSessionCookieName = "elevenhouse_astrologer_session";
const defaultCsrfCookieName = "elevenhouse_admin_csrf";
const defaultCsrfHeaderName = "x-csrf-token";
const defaultCsrfSecret = "development-admin-csrf-secret-32-bytes-minimum";
const defaultCsrfTokenTtlSeconds = 604_800;
const defaultCsrfNonce = "elevenhouse-dev-admin-finance-csrf";
const csrfTokenVersion = "v1";
const chargebackBlockedFailureReason =
  "Provider chargeback blocked payout before paid confirmation";

const platformFeeBps = 800;
const chargebackGrossAmountMinor = 50_000;
const chargebackPlatformFeeAmountMinor = 4_000;
const chargebackAstrologerNetAmountMinor = 46_000;

const saleScenarios = [
  {
    title: "Натальный разбор",
    orderId: fixture.capturedSaleOrderIdA,
    paymentAttemptId: fixture.capturedSalePaymentAttemptIdA,
    providerEventId: fixture.capturedSaleProviderEventIdA,
    providerPaymentId: "arc-dev-sale-natal",
    providerCheckoutId: "arc-dev-checkout-sale-natal",
    idempotencyKey: "dev-admin-finance-sale-natal",
    capturedLedgerTransactionId: fixture.capturedSaleLedgerTransactionIdA,
    releaseLedgerTransactionId: fixture.capturedSaleReleaseLedgerTransactionIdA,
    grossAmountMinor: 15_000_000,
    platformFeeAmountMinor: 1_200_000,
    astrologerNetAmountMinor: 13_800_000,
    occurredAt: "2026-07-23T09:10:00.000Z",
    receivedAt: "2026-07-23T09:10:04.000Z",
    holdReleaseAt: "2026-07-25T09:10:04.000Z",
    releasedAt: "2026-07-25T09:15:00.000Z"
  },
  {
    title: "Синастрия",
    orderId: fixture.capturedSaleOrderIdB,
    paymentAttemptId: fixture.capturedSalePaymentAttemptIdB,
    providerEventId: fixture.capturedSaleProviderEventIdB,
    providerPaymentId: "arc-dev-sale-synastry",
    providerCheckoutId: "arc-dev-checkout-sale-synastry",
    idempotencyKey: "dev-admin-finance-sale-synastry",
    capturedLedgerTransactionId: fixture.capturedSaleLedgerTransactionIdB,
    releaseLedgerTransactionId: fixture.capturedSaleReleaseLedgerTransactionIdB,
    grossAmountMinor: 9_000_000,
    platformFeeAmountMinor: 720_000,
    astrologerNetAmountMinor: 8_280_000,
    occurredAt: "2026-07-24T12:30:00.000Z",
    receivedAt: "2026-07-24T12:30:05.000Z",
    holdReleaseAt: "2026-07-26T12:30:05.000Z",
    releasedAt: "2026-07-26T12:35:00.000Z"
  },
  {
    title: "Прогноз на год",
    orderId: fixture.pendingSaleOrderId,
    paymentAttemptId: fixture.pendingSalePaymentAttemptId,
    providerEventId: fixture.pendingSaleProviderEventId,
    providerPaymentId: "arc-dev-sale-year-forecast",
    providerCheckoutId: "arc-dev-checkout-sale-year-forecast",
    idempotencyKey: "dev-admin-finance-sale-year-forecast",
    capturedLedgerTransactionId: fixture.pendingSaleLedgerTransactionId,
    releaseLedgerTransactionId: null,
    grossAmountMinor: 4_450_000,
    platformFeeAmountMinor: 356_000,
    astrologerNetAmountMinor: 4_094_000,
    occurredAt: "2026-07-28T09:30:00.000Z",
    receivedAt: "2026-07-28T09:30:05.000Z",
    holdReleaseAt: "2026-07-30T09:30:05.000Z",
    releasedAt: null
  }
] as const;

type Queryable = Pick<PoolClient, "query">;

export async function seedAdminFinanceBrowserFixture(
  runtime: PostgresRuntime,
  options: AdminFinanceBrowserFixtureOptions = {}
): Promise<AdminFinanceBrowserFixtureResult> {
  const client = await runtime.pool.connect();
  try {
    await client.query("BEGIN");
    await seedUsersAndAdminSession(client);
    await seedFinancePolicy(client);
    await seedProductsAndPayments(client);
    await seedPayouts(client);
    await resetFixtureLedger(client);
    await seedLedger(client);
    await seedReconciliationException(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const sessionTokenHash = hashSessionToken(fixture.sessionToken);
  const astrologerSessionTokenHash = hashSessionToken(fixture.astrologerSessionToken);
  const sessionCookieName = options.sessionCookieName ?? defaultSessionCookieName;
  const astrologerSessionCookieName =
    options.astrologerSessionCookieName ?? defaultAstrologerSessionCookieName;
  const csrfCookieName = options.csrfCookieName ?? defaultCsrfCookieName;
  const csrfHeaderName = options.csrfHeaderName ?? defaultCsrfHeaderName;
  const csrfToken = createCsrfToken({
    sessionTokenHash,
    csrfSecret: options.csrfSecret ?? defaultCsrfSecret,
    ttlSeconds: options.csrfTokenTtlSeconds ?? defaultCsrfTokenTtlSeconds,
    now: options.csrfNow ?? new Date()
  });
  const sessionCookie = `${sessionCookieName}=${fixture.sessionToken}`;
  const astrologerSessionCookie = `${astrologerSessionCookieName}=${fixture.astrologerSessionToken}`;
  const csrfCookie = `${csrfCookieName}=${csrfToken}`;
  return {
    adminUserId: fixture.adminUserId,
    astrologerUserId: fixture.astrologerUserId,
    sessionToken: fixture.sessionToken,
    sessionTokenHash,
    sessionCookieName,
    sessionCookie,
    astrologerSessionToken: fixture.astrologerSessionToken,
    astrologerSessionTokenHash,
    astrologerSessionCookieName,
    astrologerSessionCookie,
    csrfCookieName,
    csrfHeaderName,
    csrfToken,
    csrfCookie,
    browserConsoleHelper: [
      `document.cookie = "${sessionCookie}; Path=/; SameSite=Lax"`,
      `document.cookie = "${csrfCookie}; Path=/; SameSite=Lax"`,
      "location.reload()"
    ].join("; "),
    astrologerBrowserConsoleHelper: [
      `document.cookie = "${astrologerSessionCookie}; Path=/; SameSite=Lax"`,
      "location.reload()"
    ].join("; "),
    openPayoutRequestId: fixture.openPayoutRequestId,
    processingPayoutRequestId: fixture.processingPayoutRequestId,
    chargebackBlockedPayoutRequestId: fixture.chargebackBlockedPayoutRequestId,
    chargebackProviderEventId: fixture.chargebackProviderEventId,
    reconciliationExceptionId: fixture.reconciliationExceptionId
  };
}

async function seedUsersAndAdminSession(client: Queryable): Promise<void> {
  await query(
    client,
    `insert into users (id, status, created_at, updated_at)
     values
       ($1, 'active', $4, $4),
       ($2, 'active', $4, $4),
       ($3, 'active', $4, $4)
     on conflict (id) do update
     set status = 'active',
         updated_at = excluded.updated_at`,
    [fixture.adminUserId, fixture.astrologerUserId, fixture.clientUserId, now]
  );
  await query(
    client,
    `insert into user_profiles (user_id, display_name, created_at, updated_at)
     values
       ($1, 'Dev Finance Admin', $4, $4),
       ($2, 'Dev Finance Astrologer', $4, $4),
       ($3, 'Dev Finance Client', $4, $4)
     on conflict (user_id) do update
     set display_name = excluded.display_name,
         updated_at = excluded.updated_at`,
    [fixture.adminUserId, fixture.astrologerUserId, fixture.clientUserId, now]
  );
  await query(
    client,
    `insert into user_role_assignments (user_id, role, assigned_by_user_id, assigned_at)
     values
       ($1, 'admin', $1, $4),
       ($2, 'astrologer', $1, $4),
       ($3, 'client', $1, $4)
     on conflict (user_id, role) do update
     set assigned_by_user_id = excluded.assigned_by_user_id,
         assigned_at = excluded.assigned_at`,
    [fixture.adminUserId, fixture.astrologerUserId, fixture.clientUserId, now]
  );

  const sessionTokenHash = hashSessionToken(fixture.sessionToken);
  const astrologerSessionTokenHash = hashSessionToken(fixture.astrologerSessionToken);
  await query(
    client,
    "delete from user_sessions where token_hash = any($1::text[]) and id <> all($2::uuid[])",
    [
      [sessionTokenHash, astrologerSessionTokenHash],
      [fixture.sessionId, fixture.astrologerSessionId]
    ]
  );
  await query(
    client,
    `insert into user_sessions
       (id, user_id, token_hash, status, user_agent, ip_address, created_at, last_seen_at, expires_at, revoked_at)
     values
       ($1, $2, $3, 'active', 'ElevenHouse dev finance fixture', '127.0.0.1',
        $6, $6, $7, null),
       ($4, $5, $8, 'active', 'ElevenHouse dev finance fixture', '127.0.0.1',
        $6, $6, $7, null)
     on conflict (id) do update
     set user_id = excluded.user_id,
         token_hash = excluded.token_hash,
         status = 'active',
         user_agent = excluded.user_agent,
         ip_address = excluded.ip_address,
         last_seen_at = excluded.last_seen_at,
         expires_at = excluded.expires_at,
         revoked_at = null`,
    [
      fixture.sessionId,
      fixture.adminUserId,
      sessionTokenHash,
      fixture.astrologerSessionId,
      fixture.astrologerUserId,
      now,
      sessionExpiresAt,
      astrologerSessionTokenHash
    ]
  );
  await query(
    client,
    `insert into auth_security_events
       (id, user_id, session_id, event_type, occurred_at, ip_address, user_agent, metadata)
     values
       ($1, $2, $3, 'login_succeeded', $6, '127.0.0.1',
        'ElevenHouse dev finance fixture', jsonb_build_object('source', 'seed-dev-admin-finance')),
       ($4, $5, $7, 'login_succeeded', $6, '127.0.0.1',
        'ElevenHouse dev finance fixture', jsonb_build_object('source', 'seed-dev-admin-finance'))
     on conflict (id) do update
     set user_id = excluded.user_id,
         session_id = excluded.session_id,
         event_type = excluded.event_type,
         occurred_at = excluded.occurred_at,
         metadata = excluded.metadata`,
    [
      fixture.authSecurityEventId,
      fixture.adminUserId,
      fixture.sessionId,
      fixture.astrologerAuthSecurityEventId,
      fixture.astrologerUserId,
      now,
      fixture.astrologerSessionId
    ]
  );
}

async function seedFinancePolicy(client: Queryable): Promise<void> {
  await query(
    client,
    "update finance_policies set is_active = false where risk_tier = 'manual_review' and id <> $1",
    [fixture.financePolicyId]
  );
  await query(
    client,
    `insert into finance_policies
       (id, policy_version, risk_tier, hold_duration_hours, reserve_bps,
        reserve_release_delay_days, platform_fee_bps, provider_settlement_required,
        is_active, created_by_user_id, snapshotted_at, created_at)
     values ($1, 970001, 'manual_review', 48, 0, 0, $4, true, true, $2, $3, $3)
     on conflict (id) do update
     set hold_duration_hours = excluded.hold_duration_hours,
         reserve_bps = excluded.reserve_bps,
         reserve_release_delay_days = excluded.reserve_release_delay_days,
         platform_fee_bps = excluded.platform_fee_bps,
         provider_settlement_required = excluded.provider_settlement_required,
         is_active = true,
         created_by_user_id = excluded.created_by_user_id,
         snapshotted_at = excluded.snapshotted_at`,
    [fixture.financePolicyId, fixture.adminUserId, now, platformFeeBps]
  );
}

async function seedProductsAndPayments(client: Queryable): Promise<void> {
  await query(
    client,
    `insert into products
       (id, owner_user_id, type, status, title, price_minor, currency,
        execution_mode, payment_model, duration_minutes, participant_mode, created_at, updated_at)
     values ($1, $2, 'single', 'active', 'Dev finance consultation', 50000, 'RUB',
       'live', 'once', 60, 'solo', $3, $3)
     on conflict (id) do update
     set owner_user_id = excluded.owner_user_id,
         status = excluded.status,
         title = excluded.title,
         price_minor = excluded.price_minor,
         updated_at = excluded.updated_at`,
    [fixture.productId, fixture.astrologerUserId, now]
  );
  await query(
    client,
    `insert into orders
       (id, client_user_id, astrologer_user_id, product_id, status,
        gross_amount_minor, gross_currency, platform_fee_amount_minor, platform_fee_currency,
        astrologer_net_amount_minor, astrologer_net_currency, finance_policy_snapshot_id,
        finance_policy_risk_tier, finance_policy_hold_duration_hours,
        finance_policy_reserve_bps, finance_policy_reserve_release_delay_days,
        finance_policy_platform_fee_bps, finance_policy_provider_settlement_required,
        created_at, updated_at)
     values ($1, $2, $3, $4, 'chargeback', $7, 'RUB', $8, 'RUB', $9, 'RUB',
       $5, 'manual_review', 48, 0, 0, $10, true, $6, $6)
     on conflict (id) do update
     set status = excluded.status,
         gross_amount_minor = excluded.gross_amount_minor,
         platform_fee_amount_minor = excluded.platform_fee_amount_minor,
         astrologer_net_amount_minor = excluded.astrologer_net_amount_minor,
         finance_policy_platform_fee_bps = excluded.finance_policy_platform_fee_bps,
         updated_at = excluded.updated_at`,
    [
      fixture.chargebackOrderId,
      fixture.clientUserId,
      fixture.astrologerUserId,
      fixture.productId,
      fixture.financePolicyId,
      now,
      chargebackGrossAmountMinor,
      chargebackPlatformFeeAmountMinor,
      chargebackAstrologerNetAmountMinor,
      platformFeeBps
    ]
  );
  await query(
    client,
    `insert into payment_attempts
       (id, order_id, provider, environment, status, amount_minor, currency,
        provider_payment_id, provider_checkout_id, idempotency_key, metadata, created_at, updated_at)
     values ($1, $2, 'arc_pay', 'sandbox', 'chargeback', $4, 'RUB',
       'arc-dev-chargeback-payment', 'arc-dev-checkout-chargeback', 'dev-admin-finance-chargeback',
       jsonb_build_object('source', 'seed-dev-admin-finance'), $3, $3)
     on conflict (id) do update
     set status = excluded.status,
         amount_minor = excluded.amount_minor,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at`,
    [fixture.chargebackPaymentAttemptId, fixture.chargebackOrderId, now, chargebackGrossAmountMinor]
  );
  await query(
    client,
    `insert into payment_provider_events
       (id, payment_attempt_id, provider, environment, provider_webhook_id,
        provider_payment_id, type, occurred_at, received_at, payload)
     values ($1, $2, 'arc_pay', 'sandbox', 'wh_dev_chargeback_1',
       'arc-dev-chargeback-payment', 'payment.chargeback', $3, $3,
       jsonb_build_object('source', 'seed-dev-admin-finance'))
     on conflict (id) do update
     set payment_attempt_id = excluded.payment_attempt_id,
         type = excluded.type,
         occurred_at = excluded.occurred_at,
         received_at = excluded.received_at,
         payload = excluded.payload`,
    [fixture.chargebackProviderEventId, fixture.chargebackPaymentAttemptId, now]
  );
  for (const sale of saleScenarios) {
    await query(
      client,
      `insert into orders
         (id, client_user_id, astrologer_user_id, product_id, status,
          gross_amount_minor, gross_currency, platform_fee_amount_minor, platform_fee_currency,
          astrologer_net_amount_minor, astrologer_net_currency, finance_policy_snapshot_id,
          finance_policy_risk_tier, finance_policy_hold_duration_hours,
          finance_policy_reserve_bps, finance_policy_reserve_release_delay_days,
          finance_policy_platform_fee_bps, finance_policy_provider_settlement_required,
          created_at, updated_at)
       values ($1, $2, $3, $4, 'paid', $5, 'RUB', $6, 'RUB', $7, 'RUB',
         $8, 'manual_review', 48, 0, 0, $9, true, $10, $10)
       on conflict (id) do update
       set status = excluded.status,
           gross_amount_minor = excluded.gross_amount_minor,
           platform_fee_amount_minor = excluded.platform_fee_amount_minor,
           astrologer_net_amount_minor = excluded.astrologer_net_amount_minor,
           finance_policy_platform_fee_bps = excluded.finance_policy_platform_fee_bps,
           updated_at = excluded.updated_at`,
      [
        sale.orderId,
        fixture.clientUserId,
        fixture.astrologerUserId,
        fixture.productId,
        sale.grossAmountMinor,
        sale.platformFeeAmountMinor,
        sale.astrologerNetAmountMinor,
        fixture.financePolicyId,
        platformFeeBps,
        sale.receivedAt
      ]
    );
    await query(
      client,
      `insert into payment_attempts
         (id, order_id, provider, environment, status, amount_minor, currency,
          provider_payment_id, provider_checkout_id, idempotency_key, metadata, created_at, updated_at)
       values ($1, $2, 'arc_pay', 'sandbox', 'captured', $3, 'RUB',
         $4, $5, $6, jsonb_build_object('source', 'seed-dev-admin-finance', 'productTitle', $7::text),
         $8, $8)
       on conflict (id) do update
       set status = excluded.status,
           amount_minor = excluded.amount_minor,
           provider_payment_id = excluded.provider_payment_id,
           provider_checkout_id = excluded.provider_checkout_id,
           metadata = excluded.metadata,
           updated_at = excluded.updated_at`,
      [
        sale.paymentAttemptId,
        sale.orderId,
        sale.grossAmountMinor,
        sale.providerPaymentId,
        sale.providerCheckoutId,
        sale.idempotencyKey,
        sale.title,
        sale.receivedAt
      ]
    );
    await query(
      client,
      `insert into payment_provider_events
         (id, payment_attempt_id, provider, environment, provider_webhook_id,
          provider_payment_id, type, occurred_at, received_at, payload)
       values ($1, $2, 'arc_pay', 'sandbox', $3, $4, 'payment.captured', $5, $6,
         jsonb_build_object('source', 'seed-dev-admin-finance', 'productTitle', $7::text))
       on conflict (id) do update
       set payment_attempt_id = excluded.payment_attempt_id,
           provider_payment_id = excluded.provider_payment_id,
           type = excluded.type,
           occurred_at = excluded.occurred_at,
           received_at = excluded.received_at,
           payload = excluded.payload`,
      [
        sale.providerEventId,
        sale.paymentAttemptId,
        `wh_${sale.providerPaymentId}`,
        sale.providerPaymentId,
        sale.occurredAt,
        sale.receivedAt,
        sale.title
      ]
    );
  }
}

async function seedPayouts(client: Queryable): Promise<void> {
  await query(
    client,
    "update payout_methods set is_default = false where astrologer_user_id = $1 and id <> $2",
    [fixture.astrologerUserId, fixture.payoutMethodId]
  );
  await query(
    client,
    `insert into payout_methods
       (id, astrologer_user_id, method, currency, display_name,
        manual_bank_transfer_details, provider, environment, provider_payout_account_id,
        is_default, created_at, updated_at)
     values ($1, $2, 'manual_bank_transfer', 'RUB', 'Dev manual bank transfer',
       jsonb_build_object(
         'recipientName', 'Dev Finance Astrologer',
         'bankName', 'Dev Bank',
         'accountNumberLast4', '4242'
       ),
       null, null, null, true, $3, $3)
     on conflict (id) do update
     set display_name = excluded.display_name,
         manual_bank_transfer_details = excluded.manual_bank_transfer_details,
         is_default = true,
         updated_at = excluded.updated_at`,
    [fixture.payoutMethodId, fixture.astrologerUserId, now]
  );
  await query(
    client,
    `insert into payout_requests
       (id, astrologer_user_id, payout_method_id, status, amount_minor, currency,
        method, provider, environment, requested_at, reviewed_at, completed_at,
        admin_user_id, admin_note, failure_reason, external_reference,
        transferred_at, provider_payout_id, metadata, created_at, updated_at)
     values
       ($1, $3, $4, 'requested', 1000000, 'RUB', 'manual_bank_transfer', null, null,
        '2026-07-28T09:00:00.000Z', null, null, null, null, null, null, null, null,
        jsonb_build_object('source', 'seed-dev-admin-finance', 'scenario', 'open-manual-payout'),
        $7, $7),
       ($2, $3, $4, 'cancelled', $10, 'RUB', 'manual_bank_transfer', null, null,
        '2026-07-28T09:05:00.000Z', $6, $6, null,
        'Blocked automatically by provider chargeback wh_dev_chargeback_1 for order 10000000-0000-4000-8000-000000000011',
        $5, null, null, null,
        jsonb_build_object('source', 'seed-dev-admin-finance', 'scenario', 'chargeback-blocked-payout'),
        $7, $7),
       ($8, $3, $4, 'processing_manual', 1500000, 'RUB', 'manual_bank_transfer', null, null,
        '2026-07-28T09:03:00.000Z', $6, null, $9, null, null, null, null, null,
        jsonb_build_object('source', 'seed-dev-admin-finance', 'scenario', 'processing-manual-payout'),
        $7, $7)
     on conflict (id) do update
     set status = excluded.status,
         amount_minor = excluded.amount_minor,
         reviewed_at = excluded.reviewed_at,
         completed_at = excluded.completed_at,
         admin_user_id = excluded.admin_user_id,
         admin_note = excluded.admin_note,
         failure_reason = excluded.failure_reason,
         external_reference = excluded.external_reference,
         transferred_at = excluded.transferred_at,
         provider_payout_id = excluded.provider_payout_id,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at`,
    [
      fixture.openPayoutRequestId,
      fixture.chargebackBlockedPayoutRequestId,
      fixture.astrologerUserId,
      fixture.payoutMethodId,
      chargebackBlockedFailureReason,
      now,
      now,
      fixture.processingPayoutRequestId,
      fixture.adminUserId,
      chargebackAstrologerNetAmountMinor
    ]
  );
}

async function resetFixtureLedger(client: Queryable): Promise<void> {
  const fixtureTransactionIds = [
    fixture.fundingLedgerTransactionId,
    fixture.openPayoutReservedLedgerTransactionId,
    fixture.processingPayoutReservedLedgerTransactionId,
    fixture.blockedPayoutReservedLedgerTransactionId,
    fixture.blockedPayoutFailedLedgerTransactionId,
    fixture.chargebackLedgerTransactionId,
    fixture.capturedSaleLedgerTransactionIdA,
    fixture.capturedSaleReleaseLedgerTransactionIdA,
    fixture.capturedSaleLedgerTransactionIdB,
    fixture.capturedSaleReleaseLedgerTransactionIdB,
    fixture.pendingSaleLedgerTransactionId
  ];
  const fixturePayoutRequestIds = [
    fixture.openPayoutRequestId,
    fixture.processingPayoutRequestId,
    fixture.chargebackBlockedPayoutRequestId
  ];
  const fixtureOrderIds = [fixture.chargebackOrderId, ...saleScenarios.map((sale) => sale.orderId)];
  const transactionIds = await query<{ readonly id: string }>(
    client,
    `select id
     from ledger_transactions
     where id = any($1::uuid[])
        or payout_request_id = any($2::uuid[])
        or order_id = any($3::uuid[])`,
    [fixtureTransactionIds, fixturePayoutRequestIds, fixtureOrderIds]
  );
  const ids = transactionIds.rows.map((row) => row.id);
  if (ids.length > 0) {
    await query(
      client,
      "delete from ledger_entries where ledger_transaction_id = any($1::uuid[])",
      [ids]
    );
    await query(client, "delete from ledger_transactions where id = any($1::uuid[])", [ids]);
  }
  await query(
    client,
    `delete from finance_idempotency_commands
     where (
       scope = 'admin.finance.payout-status.terminal'
       and idempotency_key = any($1::text[])
     )
       or (
         scope = 'admin.finance.payment-reversal-review'
         and idempotency_key = $2
       )`,
    [
      fixturePayoutRequestIds.map((payoutRequestId) => `${payoutRequestId}:terminal`),
      `${fixture.chargebackProviderEventId}:review`
    ]
  );
  await query(
    client,
    `delete from audit_log_entries
     where target_id = any($1::text[])`,
    [
      [
        ...fixturePayoutRequestIds,
        fixture.chargebackProviderEventId,
        fixture.reconciliationExceptionId
      ]
    ]
  );
  await query(client, "delete from wallet_balance_read_models where astrologer_user_id = $1", [
    fixture.astrologerUserId
  ]);
}

async function seedLedger(client: Queryable): Promise<void> {
  for (const sale of saleScenarios) {
    await createLedgerTransaction(client, {
      id: sale.capturedLedgerTransactionId,
      operationType: "sale_captured",
      orderId: sale.orderId,
      payoutRequestId: null,
      occurredAt: sale.occurredAt,
      postedAt: sale.receivedAt,
      metadata: {
        source: "seed-dev-admin-finance",
        productTitle: sale.title,
        providerEventId: sale.providerEventId,
        paymentAttemptId: sale.paymentAttemptId,
        provider: "arc_pay",
        environment: "sandbox",
        providerPaymentId: sale.providerPaymentId,
        holdDurationHours: 48,
        holdReleaseAt: sale.holdReleaseAt,
        financePolicySnapshotId: fixture.financePolicyId,
        financePolicyRiskTier: "manual_review"
      },
      entries: [
        entry("platform_clearing", null, "debit", sale.grossAmountMinor, {
          orderId: sale.orderId,
          providerEventId: sale.providerEventId
        }),
        entry(
          "astrologer_pending",
          fixture.astrologerUserId,
          "credit",
          sale.astrologerNetAmountMinor,
          {
            orderId: sale.orderId,
            providerEventId: sale.providerEventId,
            holdDurationHours: 48,
            holdReleaseAt: sale.holdReleaseAt,
            financePolicySnapshotId: fixture.financePolicyId
          }
        ),
        entry("platform_revenue", null, "credit", sale.platformFeeAmountMinor, {
          orderId: sale.orderId,
          providerEventId: sale.providerEventId
        })
      ]
    });

    if (sale.releaseLedgerTransactionId && sale.releasedAt) {
      await createLedgerTransaction(client, {
        id: sale.releaseLedgerTransactionId,
        operationType: "funds_released",
        orderId: sale.orderId,
        payoutRequestId: null,
        occurredAt: sale.releasedAt,
        postedAt: sale.releasedAt,
        metadata: {
          source: "seed-dev-admin-finance",
          reason: "captured_sale_hold_elapsed",
          holdReleaseAt: sale.holdReleaseAt,
          providerEventId: sale.providerEventId,
          paymentAttemptId: sale.paymentAttemptId
        },
        entries: [
          entry(
            "astrologer_pending",
            fixture.astrologerUserId,
            "debit",
            sale.astrologerNetAmountMinor,
            {
              orderId: sale.orderId,
              reason: "captured_sale_hold_elapsed",
              holdReleaseAt: sale.holdReleaseAt
            }
          ),
          entry(
            "astrologer_available",
            fixture.astrologerUserId,
            "credit",
            sale.astrologerNetAmountMinor,
            {
              orderId: sale.orderId,
              reason: "captured_sale_hold_elapsed",
              holdReleaseAt: sale.holdReleaseAt
            }
          )
        ]
      });
    }
  }

  await createLedgerTransaction(client, {
    id: fixture.openPayoutReservedLedgerTransactionId,
    operationType: "payout_reserved",
    orderId: null,
    payoutRequestId: fixture.openPayoutRequestId,
    occurredAt: "2026-07-28T09:00:00.000Z",
    postedAt: "2026-07-28T09:00:00.000Z",
    metadata: { source: "seed-dev-admin-finance", payoutMethodId: fixture.payoutMethodId },
    entries: [
      entry("astrologer_available", fixture.astrologerUserId, "debit", 1_000_000),
      entry("astrologer_payout_pending", fixture.astrologerUserId, "credit", 1_000_000)
    ]
  });
  await createLedgerTransaction(client, {
    id: fixture.processingPayoutReservedLedgerTransactionId,
    operationType: "payout_reserved",
    orderId: null,
    payoutRequestId: fixture.processingPayoutRequestId,
    occurredAt: "2026-07-28T09:03:00.000Z",
    postedAt: "2026-07-28T09:03:00.000Z",
    metadata: { source: "seed-dev-admin-finance", payoutMethodId: fixture.payoutMethodId },
    entries: [
      entry("astrologer_available", fixture.astrologerUserId, "debit", 1_500_000),
      entry("astrologer_payout_pending", fixture.astrologerUserId, "credit", 1_500_000)
    ]
  });
  await createLedgerTransaction(client, {
    id: fixture.blockedPayoutReservedLedgerTransactionId,
    operationType: "payout_reserved",
    orderId: null,
    payoutRequestId: fixture.chargebackBlockedPayoutRequestId,
    occurredAt: "2026-07-28T09:05:00.000Z",
    postedAt: "2026-07-28T09:05:00.000Z",
    metadata: { source: "seed-dev-admin-finance", payoutMethodId: fixture.payoutMethodId },
    entries: [
      entry(
        "astrologer_available",
        fixture.astrologerUserId,
        "debit",
        chargebackAstrologerNetAmountMinor
      ),
      entry(
        "astrologer_payout_pending",
        fixture.astrologerUserId,
        "credit",
        chargebackAstrologerNetAmountMinor
      )
    ]
  });
  await createLedgerTransaction(client, {
    id: fixture.blockedPayoutFailedLedgerTransactionId,
    operationType: "payout_failed",
    orderId: null,
    payoutRequestId: fixture.chargebackBlockedPayoutRequestId,
    occurredAt: "2026-07-28T09:06:00.000Z",
    postedAt: "2026-07-28T09:06:00.000Z",
    metadata: {
      source: "seed-dev-admin-finance",
      failureReason: chargebackBlockedFailureReason
    },
    entries: [
      entry(
        "astrologer_payout_pending",
        fixture.astrologerUserId,
        "debit",
        chargebackAstrologerNetAmountMinor
      ),
      entry(
        "astrologer_available",
        fixture.astrologerUserId,
        "credit",
        chargebackAstrologerNetAmountMinor
      )
    ]
  });
  await createLedgerTransaction(client, {
    id: fixture.chargebackLedgerTransactionId,
    operationType: "chargeback_recorded",
    orderId: fixture.chargebackOrderId,
    payoutRequestId: null,
    occurredAt: "2026-07-28T09:07:00.000Z",
    postedAt: "2026-07-28T09:07:00.000Z",
    metadata: {
      source: "seed-dev-admin-finance",
      reason: "provider_chargeback",
      providerEventId: fixture.chargebackProviderEventId,
      paymentAttemptId: fixture.chargebackPaymentAttemptId,
      provider: "arc_pay",
      environment: "sandbox",
      providerPaymentId: "arc-dev-chargeback-payment",
      reversalGrossAmountMinor: chargebackGrossAmountMinor,
      platformFeeReversalAmountMinor: chargebackPlatformFeeAmountMinor,
      astrologerShareReversalAmountMinor: chargebackAstrologerNetAmountMinor,
      financePolicySnapshotId: fixture.financePolicyId,
      financePolicyRiskTier: "manual_review"
    },
    entries: [
      entry("platform_revenue", null, "debit", chargebackPlatformFeeAmountMinor),
      entry(
        "astrologer_available",
        fixture.astrologerUserId,
        "debit",
        chargebackAstrologerNetAmountMinor
      ),
      entry("platform_clearing", null, "credit", chargebackGrossAmountMinor)
    ]
  });
}

async function seedReconciliationException(client: Queryable): Promise<void> {
  await query(
    client,
    `insert into reconciliation_records
       (id, provider, environment, provider_payment_id, provider_payout_id,
        provider_settlement_id, provider_event_id, status, exception_code,
        exception_message, provider_occurred_at, checked_at, resolved_at, payload)
     values ($1, 'arc_pay', 'sandbox', 'arc-dev-chargeback-payment', null,
       'settlement-dev-2026-07-28', $2, 'exception', 'chargeback_settlement_review',
       'Chargeback event requires settlement follow-up before closing finance review',
       $3, $3, null, jsonb_build_object('source', 'seed-dev-admin-finance'))
     on conflict (id) do update
     set status = 'exception',
         exception_code = excluded.exception_code,
         exception_message = excluded.exception_message,
         checked_at = excluded.checked_at,
         resolved_at = null,
         payload = excluded.payload`,
    [fixture.reconciliationExceptionId, fixture.chargebackProviderEventId, now]
  );
}

type LedgerTransactionInput = {
  readonly id: string;
  readonly operationType: string;
  readonly orderId: string | null;
  readonly payoutRequestId: string | null;
  readonly occurredAt: string;
  readonly postedAt: string;
  readonly metadata: Record<string, unknown>;
  readonly entries: readonly LedgerEntryInput[];
};

type LedgerEntryInput = {
  readonly accountType: string;
  readonly astrologerUserId: string | null;
  readonly side: "debit" | "credit";
  readonly amountMinor: number;
  readonly metadata: Record<string, unknown>;
};

function entry(
  accountType: string,
  astrologerUserId: string | null,
  side: "debit" | "credit",
  amountMinor: number,
  metadata: Record<string, unknown> = {}
): LedgerEntryInput {
  return {
    accountType,
    astrologerUserId,
    side,
    amountMinor,
    metadata: { source: "seed-dev-admin-finance", ...metadata }
  };
}

async function createLedgerTransaction(
  client: Queryable,
  input: LedgerTransactionInput
): Promise<void> {
  assertBalanced(input.entries);
  await query(
    client,
    `insert into ledger_transactions
       (id, operation_type, order_id, payout_request_id, occurred_at, posted_at, metadata)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     on conflict (id) do update
     set operation_type = excluded.operation_type,
         order_id = excluded.order_id,
         payout_request_id = excluded.payout_request_id,
         occurred_at = excluded.occurred_at,
         posted_at = excluded.posted_at,
         metadata = excluded.metadata`,
    [
      input.id,
      input.operationType,
      input.orderId,
      input.payoutRequestId,
      input.occurredAt,
      input.postedAt,
      JSON.stringify(input.metadata)
    ]
  );

  for (const ledgerEntry of input.entries) {
    const accountId = await findOrCreateLedgerAccount(client, ledgerEntry);
    await query(
      client,
      `insert into ledger_entries
         (ledger_transaction_id, account_id, entry_side, amount_minor, currency, metadata, created_at)
       values ($1, $2, $3, $4, 'RUB', $5::jsonb, $6)`,
      [
        input.id,
        accountId,
        ledgerEntry.side,
        ledgerEntry.amountMinor,
        JSON.stringify(ledgerEntry.metadata),
        input.postedAt
      ]
    );
  }

  if (input.entries.some((ledgerEntry) => ledgerEntry.astrologerUserId)) {
    await recomputeWallet(client, fixture.astrologerUserId, input.postedAt);
  }
}

async function findOrCreateLedgerAccount(
  client: Queryable,
  ledgerEntry: LedgerEntryInput
): Promise<string> {
  const balanceBucket = walletBucketForAccountType(ledgerEntry.accountType);
  const existing = await query<{ readonly id: string }>(
    client,
    `select id
     from ledger_accounts
     where account_type = $1
       and currency = 'RUB'
       and (
         ($2::uuid is null and astrologer_user_id is null)
         or astrologer_user_id = $2::uuid
       )
     limit 1`,
    [ledgerEntry.accountType, ledgerEntry.astrologerUserId]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await query<{ readonly id: string }>(
    client,
    `insert into ledger_accounts
       (account_type, astrologer_user_id, balance_bucket, currency, created_at)
     values ($1, $2, $3, 'RUB', $4)
     returning id`,
    [ledgerEntry.accountType, ledgerEntry.astrologerUserId, balanceBucket, now]
  );
  const accountId = inserted.rows[0]?.id;
  if (!accountId) throw new Error("Expected ledger account id");
  return accountId;
}

async function recomputeWallet(
  client: Queryable,
  astrologerUserId: string,
  updatedAt: string
): Promise<void> {
  await query(
    client,
    `insert into wallet_balance_read_models (astrologer_user_id, updated_at)
     values ($1, $2)
     on conflict (astrologer_user_id) do nothing`,
    [astrologerUserId, updatedAt]
  );
  await query(
    client,
    `update wallet_balance_read_models
     set pending_amount_minor = $2,
         available_amount_minor = $3,
         reserved_amount_minor = $4,
         payout_pending_amount_minor = $5,
         negative_balance_amount_minor = $6,
         updated_at = $7
     where astrologer_user_id = $1`,
    [
      astrologerUserId,
      await computeBucket(client, astrologerUserId, "pending"),
      await computeBucket(client, astrologerUserId, "available"),
      await computeBucket(client, astrologerUserId, "reserved"),
      await computeBucket(client, astrologerUserId, "payout_pending"),
      await computeBucket(client, astrologerUserId, "negative_balance"),
      updatedAt
    ]
  );
}

async function computeBucket(
  client: Queryable,
  astrologerUserId: string,
  bucket: string
): Promise<number> {
  const expression =
    bucket === "negative_balance"
      ? "coalesce(sum(case when entries.entry_side = 'debit' then entries.amount_minor when entries.entry_side = 'credit' then -entries.amount_minor else 0 end), 0)"
      : "coalesce(sum(case when entries.entry_side = 'credit' then entries.amount_minor when entries.entry_side = 'debit' then -entries.amount_minor else 0 end), 0)";
  const result = await query<{ readonly amount_minor: string }>(
    client,
    `select ${expression}::text as amount_minor
     from ledger_entries entries
     inner join ledger_accounts accounts on accounts.id = entries.account_id
     where accounts.astrologer_user_id = $1
       and accounts.balance_bucket = $2
       and entries.currency = 'RUB'`,
    [astrologerUserId, bucket]
  );
  const amountMinor = Number(result.rows[0]?.amount_minor ?? 0);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error(`Wallet ${bucket} balance recompute produced an invalid amount`);
  }
  return amountMinor;
}

function assertBalanced(entries: readonly LedgerEntryInput[]): void {
  const debit = entries
    .filter((ledgerEntry) => ledgerEntry.side === "debit")
    .reduce((sum, ledgerEntry) => sum + ledgerEntry.amountMinor, 0);
  const credit = entries
    .filter((ledgerEntry) => ledgerEntry.side === "credit")
    .reduce((sum, ledgerEntry) => sum + ledgerEntry.amountMinor, 0);
  if (debit !== credit) {
    throw new Error(`Ledger fixture transaction is not balanced: ${debit} != ${credit}`);
  }
}

function walletBucketForAccountType(accountType: string): string | null {
  switch (accountType) {
    case "astrologer_pending":
      return "pending";
    case "astrologer_available":
      return "available";
    case "astrologer_reserved":
      return "reserved";
    case "astrologer_payout_pending":
      return "payout_pending";
    case "astrologer_negative_balance":
      return "negative_balance";
    default:
      return null;
  }
}

function createCsrfToken(input: {
  readonly sessionTokenHash: string;
  readonly csrfSecret: string;
  readonly ttlSeconds: number;
  readonly now: Date;
}): string {
  const expiresAtMs = Math.min(
    input.now.getTime() + input.ttlSeconds * 1000,
    new Date(sessionExpiresAt).getTime()
  );
  const signature = createHmac("sha256", input.csrfSecret)
    .update(
      [csrfTokenVersion, input.sessionTokenHash, expiresAtMs.toString(), defaultCsrfNonce].join("|")
    )
    .digest("base64url");
  return [csrfTokenVersion, expiresAtMs.toString(), defaultCsrfNonce, signature].join(".");
}

async function query<T extends QueryResultRow = QueryResultRow>(
  client: Queryable,
  text: string,
  values: readonly unknown[] = []
): Promise<QueryResult<T>> {
  return client.query<T>(text, [...values]);
}
