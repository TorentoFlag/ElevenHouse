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
import { createDrizzlePlatformTariffRenewalInvoiceIssuer } from "./drizzle-platform-tariff-renewal-invoice-issuer";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_tariff_renewal_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const tariff = publishPlatformTariffDraft(createPlatformTariffDraft({
  tariffSeriesId: "pro", version: 1, name: "Pro", tagline: "Paid", monthlyPriceMinor: 2_500,
  yearlyPriceMinor: 25_000, monthlyRecurringFrequencyDays: 31, yearlyRecurringFrequencyDays: 365,
  clientSaleCommissionBps: 800, seatsLimit: 1, bookingsLimit: null, aiRequestsLimit: null,
  automationLimit: null, isPopular: false, displayOrder: 1, features: []
}));

describe.sequential("Drizzle platform tariff renewal invoice issuer", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    await pool.query(schemaSql);
  }, 30_000);
  afterAll(async () => {
    try { await pool?.end(); await adminClient.query(`drop database if exists "${databaseName}" with (force)`); }
    finally { await adminClient.end(); }
  }, 30_000);

  it("issues exactly one contiguous renewal/outbox, turns entitlement state past_due, and preserves a retired snapshot", async () => {
    const owner = "11111111-1111-4111-8111-111111111111";
    const subscription = "22222222-2222-4222-8222-222222222222";
    await seed(pool, owner, subscription, "active");
    const issuer = createDrizzlePlatformTariffRenewalInvoiceIssuer({ database: drizzle(pool) });
    await expect(issuer.issueDueRenewalInvoices({ now: "2026-08-01T00:00:00.000Z", limit: 10 })).resolves.toEqual({ issued: 1, skipped: 0 });
    await pool.query("update platform_tariff_versions set lifecycle = 'retired' where tariff_series_id = 'pro' and version = 1");
    await expect(issuer.issueDueRenewalInvoices({ now: "2026-08-01T00:01:00.000Z", limit: 10 })).resolves.toEqual({ issued: 0, skipped: 0 });
    const snapshot = await pool.query(`select state, starts_at, ends_at, version from platform_tariff_subscriptions where id = $1`, [subscription]);
    expect(snapshot.rows).toEqual([expect.objectContaining({ state: "past_due", version: 2 })]);
    const invoices = await pool.query(`select state, billing_period_start_at, billing_period_end_at from platform_tariff_invoices where subscription_id = $1`, [subscription]);
    expect(invoices.rows).toEqual([expect.objectContaining({ state: "open", billing_period_start_at: new Date("2026-08-01T00:00:00.000Z"), billing_period_end_at: new Date("2026-09-01T00:00:00.000Z") })]);
    await expect(pool.query("select * from finance_platform_tariff_invoice_charge_preparation_requests")).resolves.toMatchObject({ rowCount: 1 });
    await expect(pool.query("select * from outbox_events")).resolves.toMatchObject({ rowCount: 1 });
  });

  it("does not issue before the exact prior period end", async () => {
    const owner = "33333333-3333-4333-8333-333333333333";
    const subscription = "44444444-4444-4444-8444-444444444444";
    await seed(pool, owner, subscription, "active", "2026-08-01T00:00:00.000Z");
    const issuer = createDrizzlePlatformTariffRenewalInvoiceIssuer({ database: drizzle(pool) });
    await expect(issuer.issueDueRenewalInvoices({ now: "2026-07-31T23:59:59.999Z", limit: 10 })).resolves.toEqual({ issued: 0, skipped: 0 });
    await expect(pool.query("select * from platform_tariff_invoices where subscription_id = $1", [subscription])).resolves.toMatchObject({ rowCount: 0 });
  });
});

async function seed(pool: Pool, owner: string, subscription: string, state: string, endsAt = "2026-08-01T00:00:00.000Z") {
  await pool.query("insert into users (id) values ($1)", [owner]);
  await pool.query("insert into platform_tariff_series (id, code) values ('pro', 'pro') on conflict do nothing");
  await pool.query(`insert into platform_tariff_versions (tariff_series_id, version, draft_revision, lifecycle, name, tagline, monthly_price_minor, yearly_price_minor, monthly_recurring_frequency_days, yearly_recurring_frequency_days, currency, client_sale_commission_bps, seats_limit, bookings_limit, ai_requests_limit, automation_limit, is_popular, display_order, canonical_preimage, canonical_digest)
    values ('pro', 1, 1, 'published', $1, $2, 2500, 25000, 31, 365, 'RUB', 800, 1, null, null, null, false, 1, $3, $4) on conflict do nothing`, [tariff.name, tariff.tagline, canonicalizePlatformTariffTerms(tariff), tariff.canonicalDigest]);
  await pool.query(`insert into platform_tariff_subscriptions (id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest, commission_bps_snapshot, billing_cycle, state, version, starts_at, ends_at)
    values ($1, $2, 'pro', 1, $3, 800, 'month', $4, 1, '2026-07-01T00:00:00.000Z', $5)`, [subscription, owner, tariff.canonicalDigest, state, endsAt]);
}

function requireIntegrationDatabaseUrl(value: string | undefined): string { if (!value) throw new Error("INTEGRATION_DATABASE_URL is required"); assertDevelopmentDatabaseUrl(value); return value; }
function withDatabaseName(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

const schemaSql = `
create table users (id uuid primary key);
create table platform_tariff_series (id varchar(160) primary key, code varchar(160) not null);
create table platform_tariff_versions (
 tariff_series_id varchar(160) not null, version integer not null, draft_revision integer not null, lifecycle text not null,
 name varchar(120) not null, tagline varchar(240) not null, monthly_price_minor integer not null, yearly_price_minor integer not null,
 monthly_recurring_frequency_days integer, yearly_recurring_frequency_days integer, currency text not null,
 client_sale_commission_bps integer not null, seats_limit integer, bookings_limit integer, ai_requests_limit integer, automation_limit integer,
 is_popular boolean not null, display_order integer not null, canonical_preimage text not null, canonical_digest varchar(71) not null, created_at timestamptz not null default now(), published_at timestamptz, retired_at timestamptz,
 primary key (tariff_series_id, version), unique (tariff_series_id, version, canonical_digest));
create table platform_tariff_version_capabilities (tariff_series_id varchar(160) not null, tariff_version integer not null, capability text not null, primary key (tariff_series_id, tariff_version, capability));
create table platform_tariff_subscriptions (id uuid primary key, owner_user_id uuid not null, tariff_series_id varchar(160) not null, tariff_version integer not null, tariff_version_digest varchar(71) not null, commission_bps_snapshot integer not null, billing_cycle text not null, state text not null, version integer not null, starts_at timestamptz, ends_at timestamptz, cancelled_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table platform_tariff_invoices (id varchar(160) primary key, subscription_id uuid not null, owner_user_id uuid not null, tariff_series_id varchar(160) not null, tariff_version integer not null, tariff_version_digest varchar(71) not null, amount_minor integer not null, currency text not null, state text not null, version integer not null default 1, billing_period_start_at timestamptz not null, billing_period_end_at timestamptz not null, created_at timestamptz not null default now(), captured_at timestamptz, voided_at timestamptz);
create table finance_platform_tariff_invoice_charge_preparation_requests (id uuid primary key, invoice_id varchar(160) not null, subscription_id uuid not null, attempt_number integer not null, expected_invoice_version integer not null, expected_subscription_version integer not null, state text not null, version varchar(32) not null, economic_payment_intent_id varchar(160), economic_payment_session_id varchar(160), provider_operation_intent_id varchar(160), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table outbox_events (id uuid primary key default gen_random_uuid(), event_type text not null, aggregate_id text not null, payload jsonb not null, status text not null default 'pending', attempts integer not null default 0, claim_fence bigint not null default 0, available_at timestamptz not null default now(), locked_at timestamptz, published_at timestamptz, quarantined_at timestamptz, quarantine_reason_code text, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());`;
