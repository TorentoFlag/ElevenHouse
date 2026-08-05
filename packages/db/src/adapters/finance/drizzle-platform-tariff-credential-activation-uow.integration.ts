import { randomUUID } from "node:crypto";

import {
  canonicalizePlatformTariffTerms,
  createPlatformTariffDraft,
  publishPlatformTariffDraft
} from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createDrizzlePlatformTariffCredentialActivationUnitOfWork } from "./drizzle-platform-tariff-credential-activation-uow";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_tariff_credential_activation_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);

describe.sequential("Drizzle platform tariff credential activation UOW", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    await pool.query(minimalSchemaSql);
  }, 30_000);

  afterAll(async () => {
    try {
      await pool?.end();
      await adminClient.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("creates the initial paid invoice only for an active credential with an exact granted subscription consent", async () => {
    const fixture = await seed(pool, { consentLifecycle: "granted", credentialLifecycle: "active" });
    const unitOfWork = createDrizzlePlatformTariffCredentialActivationUnitOfWork({ database: drizzle(pool) });

    const receipt = await unitOfWork.createInitialInvoiceAfterVerifiedCredentialActivation({
      subscriptionId: fixture.subscriptionId,
      expectedSubscriptionVersion: 1,
      savedCardCredentialId: fixture.credentialId,
      savedCardCredentialVersion: "1",
      now: "2026-08-04T12:00:00.000Z"
    });

    expect(receipt).toMatchObject({
      kind: "platform_tariff_initial_invoice_activation_receipt",
      subscriptionId: fixture.subscriptionId,
      subscriptionVersion: 2,
      invoiceState: "open"
    });
    await expect(
      pool.query(
        "select state, version from platform_tariff_subscriptions where id = $1",
        [fixture.subscriptionId]
      )
    ).resolves.toMatchObject({ rows: [{ state: "awaiting_initial_payment", version: 2 }] });
    await expect(
      pool.query(
        "select amount_minor, state, billing_period_start_at, billing_period_end_at from platform_tariff_invoices where id = $1",
        [receipt.invoiceId]
      )
    ).resolves.toMatchObject({
      rows: [expect.objectContaining({ amount_minor: 2_500, state: "open" })]
    });
    await expect(
      pool.query(
        `select request.invoice_id, request.subscription_id, request.expected_invoice_version, request.expected_subscription_version,
                request.state, outbox.payload
           from finance_platform_tariff_invoice_charge_preparation_requests request
           join outbox_events outbox
             on outbox.aggregate_id = request.id
          where request.invoice_id = $1
            and outbox.event_type = 'finance.platform_tariff_invoice_charge.preparation_requested'`,
        [receipt.invoiceId]
      )
    ).resolves.toMatchObject({
      rows: [expect.objectContaining({
        invoice_id: receipt.invoiceId,
        subscription_id: fixture.subscriptionId,
        expected_invoice_version: 1,
        expected_subscription_version: 2,
        state: "pending",
        payload: expect.objectContaining({ preparationRequestId: expect.any(String) })
      })]
    });
  });

  it("replays the same verified activation without creating another invoice", async () => {
    const fixture = await seed(pool, { consentLifecycle: "granted", credentialLifecycle: "active" });
    const unitOfWork = createDrizzlePlatformTariffCredentialActivationUnitOfWork({ database: drizzle(pool) });
    const command = {
      subscriptionId: fixture.subscriptionId,
      expectedSubscriptionVersion: 1,
      savedCardCredentialId: fixture.credentialId,
      savedCardCredentialVersion: "1",
      now: "2026-08-04T12:00:00.000Z"
    };

    const first = await unitOfWork.createInitialInvoiceAfterVerifiedCredentialActivation(command);
    await expect(unitOfWork.createInitialInvoiceAfterVerifiedCredentialActivation(command)).resolves.toEqual(first);
    await expect(
      pool.query("select count(*)::int as count from platform_tariff_invoices where subscription_id = $1", [
        fixture.subscriptionId
      ])
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
    await expect(
      pool.query(
        "select count(*)::int as count from finance_platform_tariff_invoice_charge_preparation_requests where subscription_id = $1",
        [fixture.subscriptionId]
      )
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });

  it("fails closed when the exact consent is revoked or the credential is not active", async () => {
    const revokedConsent = await seed(pool, { consentLifecycle: "revoked", credentialLifecycle: "active" });
    const inactiveCredential = await seed(pool, { consentLifecycle: "granted", credentialLifecycle: "pending_activation" });
    const unitOfWork = createDrizzlePlatformTariffCredentialActivationUnitOfWork({ database: drizzle(pool) });

    await expect(
      unitOfWork.createInitialInvoiceAfterVerifiedCredentialActivation(commandFor(revokedConsent))
    ).rejects.toMatchObject({ reason: "saved_card_consent_not_active" });
    await expect(
      unitOfWork.createInitialInvoiceAfterVerifiedCredentialActivation(commandFor(inactiveCredential))
    ).rejects.toMatchObject({ reason: "saved_card_credential_not_active" });
  });
});

function commandFor(fixture: Awaited<ReturnType<typeof seed>>) {
  return {
    subscriptionId: fixture.subscriptionId,
    expectedSubscriptionVersion: 1,
    savedCardCredentialId: fixture.credentialId,
    savedCardCredentialVersion: "1",
    now: "2026-08-04T12:00:00.000Z"
  };
}

async function seed(
  pool: Pool,
  states: Readonly<{ consentLifecycle: "granted" | "revoked"; credentialLifecycle: "active" | "pending_activation" }>
) {
  const suffix = randomUUID().replaceAll("-", "");
  const seriesId = `tariff-${suffix}`;
  const subscriptionId = randomUUID();
  const ownerUserId = randomUUID();
  const consentId = `consent-${suffix}`;
  const credentialId = `credential-${suffix}`;
  const tariff = publishPlatformTariffDraft(createPlatformTariffDraft({
    tariffSeriesId: seriesId,
    version: 1,
    name: "Pro",
    tagline: "For active practice",
    monthlyPriceMinor: 2_500,
    yearlyPriceMinor: 25_000,
    monthlyRecurringFrequencyDays: 31,
    yearlyRecurringFrequencyDays: 365,
    clientSaleCommissionBps: 800,
    seatsLimit: 1,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit: null,
    isPopular: false,
    displayOrder: 0,
    features: []
  }));
  await pool.query(
    `insert into platform_tariff_versions (
       tariff_series_id, version, draft_revision, lifecycle, name, tagline, monthly_price_minor,
       yearly_price_minor, monthly_recurring_frequency_days, yearly_recurring_frequency_days,
       currency, client_sale_commission_bps, seats_limit, bookings_limit,
       ai_requests_limit, automation_limit, is_popular, display_order, canonical_preimage, canonical_digest
     ) values ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, 'RUB', $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      tariff.tariffSeriesId, tariff.draftRevision, tariff.lifecycle, tariff.name, tariff.tagline,
      tariff.monthlyPriceMinor, tariff.yearlyPriceMinor,
      tariff.monthlyRecurringFrequencyDays, tariff.yearlyRecurringFrequencyDays, tariff.clientSaleCommissionBps,
      tariff.seatsLimit, tariff.bookingsLimit, tariff.aiRequestsLimit, tariff.automationLimit,
      tariff.isPopular, tariff.displayOrder,
      JSON.stringify({}), tariff.canonicalDigest
    ]
  );
  await pool.query(
    `update platform_tariff_versions set canonical_preimage = $3 where tariff_series_id = $1 and version = $2`,
    [tariff.tariffSeriesId, tariff.version, canonicalizePlatformTariffTerms(tariff)]
  );
  await pool.query(
    `insert into platform_tariff_subscriptions (
       id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest,
       commission_bps_snapshot, billing_cycle, state, version
     ) values ($1, $2, $3, 1, $4, 800, 'month', 'incomplete_setup', 1)`,
    [subscriptionId, ownerUserId, seriesId, tariff.canonicalDigest]
  );
  await pool.query(
    `insert into finance_saved_card_consents (
       consent_id, consent_version, subscription_id, owner_user_id, tariff_series_id, tariff_version,
       tariff_version_digest, series_id, provider_account_id, provider_identity_version, provider_customer_id
     ) values ($1, 1, $2, $3, $4, 1, $5, 'arc-main', 'terminal-main', 1, $6)`,
    [consentId, subscriptionId, ownerUserId, seriesId, tariff.canonicalDigest, `customer-${suffix}`]
  );
  await pool.query(
    `insert into finance_saved_card_consent_heads (
       consent_id, consent_version, current_lifecycle
     ) values ($1, 1, $2)`,
    [consentId, states.consentLifecycle]
  );
  await pool.query(
    `insert into finance_restricted_provider_credentials (
       credential_id, credential_version, series_id, provider_account_id, provider_identity_version,
       provider_customer_id, consent_id, consent_version
     ) values ($1, 1, 'arc-main', 'terminal-main', 1, $2, $3, 1)`,
    [credentialId, `customer-${suffix}`, consentId]
  );
  await pool.query(
    `insert into finance_restricted_provider_credential_heads (
       series_id, provider_account_id, provider_identity_version, provider_customer_id,
       current_credential_id, current_credential_version, current_lifecycle
     ) values ('arc-main', 'terminal-main', 1, $1, $2, 1, $3)`,
    [`customer-${suffix}`, credentialId, states.credentialLifecycle]
  );
  return { subscriptionId, credentialId };
}

const minimalSchemaSql = `
create extension if not exists pgcrypto;
create table platform_tariff_versions (
  tariff_series_id varchar(160) not null, version integer not null, draft_revision integer not null,
  lifecycle text not null, name varchar(120) not null, tagline varchar(240) not null,
  monthly_price_minor integer not null, yearly_price_minor integer not null,
  monthly_recurring_frequency_days integer, yearly_recurring_frequency_days integer, currency text not null,
  client_sale_commission_bps integer not null, seats_limit integer, bookings_limit integer,
  ai_requests_limit integer, automation_limit integer, is_popular boolean not null, display_order integer not null,
  canonical_preimage text not null, canonical_digest varchar(71) not null, primary key (tariff_series_id, version)
);
create table platform_tariff_version_capabilities (tariff_series_id varchar(160) not null, tariff_version integer not null, capability text not null);
create table platform_tariff_subscriptions (
  id uuid primary key, owner_user_id uuid not null, tariff_series_id varchar(160) not null, tariff_version integer not null,
  tariff_version_digest varchar(71) not null, commission_bps_snapshot integer not null, billing_cycle text not null,
  state text not null, version integer not null, starts_at timestamptz, ends_at timestamptz, updated_at timestamptz not null default now()
);
create table platform_tariff_invoices (
  id varchar(160) primary key, subscription_id uuid not null, owner_user_id uuid not null, tariff_series_id varchar(160) not null,
  tariff_version integer not null, tariff_version_digest varchar(71) not null, amount_minor integer not null, currency text not null,
  state text not null, version integer not null default 1, billing_period_start_at timestamptz not null, billing_period_end_at timestamptz not null,
  created_at timestamptz not null default now(), captured_at timestamptz, voided_at timestamptz
);
create table finance_platform_tariff_invoice_charge_preparation_requests (
  id uuid primary key, invoice_id varchar(160) not null, subscription_id uuid not null,
  attempt_number integer not null default 1,
  expected_invoice_version integer not null, expected_subscription_version integer not null, state text not null, version numeric(38,0) not null,
  economic_payment_intent_id varchar(160), economic_payment_session_id varchar(160), provider_operation_intent_id varchar(160),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (invoice_id, attempt_number)
);
create table outbox_events (
  id uuid primary key default gen_random_uuid(), event_type text not null, aggregate_id uuid not null,
  payload jsonb not null, status text not null default 'pending', attempts integer not null default 0,
  claim_fence bigint not null default 0, available_at timestamptz not null default now(),
  locked_at timestamptz, published_at timestamptz, quarantined_at timestamptz,
  quarantine_reason_code text, last_error text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (event_type, aggregate_id)
);
create table finance_saved_card_consents (
  consent_id varchar(160) not null, consent_version numeric(38,0) not null, subscription_id uuid not null,
  owner_user_id uuid not null, tariff_series_id varchar(160) not null, tariff_version integer not null,
  tariff_version_digest varchar(71) not null, series_id varchar(160) not null, provider_account_id varchar(160) not null,
  provider_identity_version integer not null, provider_customer_id varchar(160) not null,
  primary key (consent_id, consent_version)
);
create table finance_saved_card_consent_heads (consent_id varchar(160) not null, consent_version numeric(38,0) not null, current_lifecycle text not null, primary key (consent_id, consent_version));
create table finance_restricted_provider_credentials (
  credential_id varchar(160) not null, credential_version numeric(38,0) not null, series_id varchar(160) not null,
  provider_account_id varchar(160) not null, provider_identity_version integer not null, provider_customer_id varchar(160) not null,
  consent_id varchar(160) not null, consent_version numeric(38,0) not null, primary key (credential_id, credential_version)
);
create table finance_restricted_provider_credential_heads (
  series_id varchar(160) not null, provider_account_id varchar(160) not null, provider_identity_version integer not null,
  provider_customer_id varchar(160) not null, current_credential_id varchar(160) not null,
  current_credential_version numeric(38,0) not null, current_lifecycle text not null,
  primary key (series_id, provider_account_id, provider_identity_version, provider_customer_id)
);
`;

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  assertDevelopmentDatabaseUrl(value);
  return value;
}

function withDatabaseName(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
