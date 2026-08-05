import { randomUUID } from "node:crypto";

import { revisePlatformTariffDraft } from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { platformTariffAuthorityIntegritySql } from "../../schema/platform-billing/tariff-authority.schema";
import { createDrizzlePlatformTariffAuthorityStore } from "./drizzle-platform-tariff-authority-store";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_tariff_store_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);

describe.sequential("Drizzle platform tariff authority store", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    await pool.query(minimalTariffStoreSchemaSql);
    await pool.query(platformTariffAuthorityIntegritySql);
  }, 30_000);

  afterAll(async () => {
    try {
      await pool?.end();
      await adminClient.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("creates, CAS-revises, and reads one digest-verified draft", async () => {
    const store = createDrizzlePlatformTariffAuthorityStore({ database: drizzle(pool) });
    const created = await store.createDraft(tariffInput());
    await expect(store.listTariffVersions()).resolves.toEqual([created]);
    const revised = revisePlatformTariffDraft({
      current: created,
      expectedDraftRevision: 1,
      next: { ...tariffInput(), monthlyPriceMinor: 2_900 }
    });
    const persisted = await store.updateDraft({
      tariffSeriesId: "pro",
      version: 1,
      expectedDraftRevision: 1,
      next: { ...tariffInput(), monthlyPriceMinor: 2_900 }
    });

    expect(persisted).toEqual(revised);
    await expect(
      store.updateDraft({
        tariffSeriesId: "pro",
        version: 1,
        expectedDraftRevision: 1,
        next: { ...tariffInput(), monthlyPriceMinor: 2_900 }
      })
    ).resolves.toEqual(persisted);
    await expect(
      store.updateDraft({
        tariffSeriesId: "pro",
        version: 1,
        expectedDraftRevision: 1,
        next: { ...tariffInput(), monthlyPriceMinor: 3_100 }
      })
    ).rejects.toMatchObject({ reason: "draft_revision_conflict" });
    await expect(
      store.findTariffVersion({
        tariffSeriesId: "pro",
        version: 1,
        canonicalDigest: revised.canonicalDigest
      })
    ).resolves.toEqual(revised);

    const published = await store.publishDraft({
      tariffSeriesId: "pro",
      version: 1,
      expectedDraftRevision: 2
    });
    expect(published).toMatchObject({ lifecycle: "published", canonicalDigest: revised.canonicalDigest });
    await expect(
      store.publishDraft({ tariffSeriesId: "pro", version: 1, expectedDraftRevision: 2 })
    ).resolves.toEqual(published);
    await expect(
      store.updateDraft({
        tariffSeriesId: "pro",
        version: 1,
        expectedDraftRevision: 2,
        next: { ...tariffInput(), monthlyPriceMinor: 2_900 }
      })
    ).rejects.toMatchObject({ reason: "draft_revision_conflict" });
  });

  it("persists a paid tariff selection without an invoice until credential activation is verified", async () => {
    const ownerUserId = "11111111-1111-4111-8111-111111111111";
    await pool.query("insert into users (id) values ($1)", [ownerUserId]);
    const store = createDrizzlePlatformTariffAuthorityStore({ database: drizzle(pool) });

    const purchase = await store.beginSubscriptionPurchase({
      ownerUserId,
      tariffSeriesId: "pro",
      version: 1,
      billingCycle: "month",
      now: "2026-08-04T12:00:00.000Z"
    });

    expect(purchase.subscription).toMatchObject({
      ownerUserId,
      tariffSeriesId: "pro",
      state: "incomplete_setup",
      commissionBpsSnapshot: 800
    });
    expect(purchase.invoice).toBeNull();
    await expect(
      store.beginSubscriptionPurchase({
        ownerUserId,
        tariffSeriesId: "pro",
        version: 1,
        billingCycle: "month",
        now: "2026-08-04T12:00:00.000Z"
      })
    ).rejects.toMatchObject({ reason: "active_subscription_exists" });
  });

  it("does not give the generic tariff store authority to create an invoice for a selected paid tariff", async () => {
    const ownerUserId = "22222222-2222-4222-8222-222222222222";
    await pool.query("insert into users (id) values ($1)", [ownerUserId]);
    const store = createDrizzlePlatformTariffAuthorityStore({ database: drizzle(pool) });
    const selection = await store.beginSubscriptionPurchase({
      ownerUserId,
      tariffSeriesId: "pro",
      version: 1,
      billingCycle: "month",
      now: "2026-08-04T12:00:00.000Z"
    });
    expect(selection.invoice).toBeNull();
    expect(selection.subscription).toMatchObject({ state: "incomplete_setup" });
    await expect(
      pool.query("select count(*)::int as count from platform_tariff_invoices where subscription_id = $1", [
        selection.subscription.subscriptionId
      ])
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it("returns only a started exact historical capability grant for the requested owner and instant", async () => {
    const ownerUserId = "33333333-3333-4333-8333-333333333333";
    await pool.query("insert into users (id) values ($1)", [ownerUserId]);
    const store = createDrizzlePlatformTariffAuthorityStore({ database: drizzle(pool) });
    const draft = await store.createDraft({
      ...tariffInput(),
      tariffSeriesId: "historical-funnels",
      features: ["funnels"]
    });
    await pool.query(
      `update platform_tariff_versions
          set lifecycle = 'published', published_at = '2026-06-01T00:00:00.000Z'
        where tariff_series_id = $1 and version = $2`,
      [draft.tariffSeriesId, draft.version]
    );
    await pool.query(
      `insert into platform_tariff_subscriptions (
         id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest,
         commission_bps_snapshot, billing_cycle, state, starts_at, ends_at
       ) values ($1, $2, $3, $4, $5, $6, 'month', 'expired', $7, $8)`,
      [
        randomUUID(),
        ownerUserId,
        draft.tariffSeriesId,
        draft.version,
        draft.canonicalDigest,
        draft.clientSaleCommissionBps,
        "2026-06-01T00:00:00.000Z",
        "2026-07-01T00:00:00.000Z"
      ]
    );

    await expect(
      store.findLatestHistoricalCapabilityGrant({
        ownerUserId,
        capability: "funnels",
        at: "2026-08-04T12:00:00.000Z"
      })
    ).resolves.toMatchObject({
      subscription: {
        ownerUserId,
        state: "expired",
        tariffVersionDigest: draft.canonicalDigest
      },
      tariff: {
        tariffSeriesId: draft.tariffSeriesId,
        lifecycle: "published",
        features: ["funnels"],
        canonicalDigest: draft.canonicalDigest
      }
    });
    await expect(
      store.findLatestHistoricalCapabilityGrant({
        ownerUserId,
        capability: "funnels",
        at: "2026-05-31T23:59:59.999Z"
      })
    ).resolves.toBeNull();
    await expect(
      store.findLatestHistoricalCapabilityGrant({
        ownerUserId,
        capability: "products",
        at: "2026-08-04T12:00:00.000Z"
      })
    ).resolves.toBeNull();
  });
});

function tariffInput() {
  return {
    tariffSeriesId: "pro",
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
    features: [] as const
  };
}

const minimalTariffStoreSchemaSql = `
create table platform_tariff_series (
  id varchar(160) primary key,
  code varchar(80) not null unique,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);
create table platform_tariff_versions (
  tariff_series_id varchar(160) not null references platform_tariff_series(id),
  version integer not null,
  draft_revision integer not null,
  lifecycle text not null,
  name varchar(120) not null,
  tagline varchar(240) not null,
  monthly_price_minor integer not null,
  yearly_price_minor integer not null,
  monthly_recurring_frequency_days integer,
  yearly_recurring_frequency_days integer,
  currency text not null,
  client_sale_commission_bps integer not null,
  seats_limit integer,
  bookings_limit integer,
  ai_requests_limit integer,
  automation_limit integer,
  is_popular boolean not null,
  display_order integer not null,
  canonical_preimage text not null,
  canonical_digest varchar(71) not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  retired_at timestamptz,
  primary key (tariff_series_id, version),
  unique (tariff_series_id, version, canonical_digest)
);
create table platform_tariff_version_capabilities (
  tariff_series_id varchar(160) not null,
  tariff_version integer not null,
  capability text not null,
  primary key (tariff_series_id, tariff_version, capability),
  foreign key (tariff_series_id, tariff_version)
    references platform_tariff_versions(tariff_series_id, version)
);
create table users (id uuid primary key);
create table platform_tariff_subscriptions (
  id uuid primary key,
  owner_user_id uuid not null references users(id),
  tariff_series_id varchar(160) not null,
  tariff_version integer not null,
  tariff_version_digest varchar(71) not null,
  commission_bps_snapshot integer not null,
  billing_cycle text not null,
  state text not null,
  version integer not null default 1,
  starts_at timestamptz,
  ends_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tariff_series_id, tariff_version, tariff_version_digest)
    references platform_tariff_versions(tariff_series_id, version, canonical_digest),
  unique (id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest)
);
create table platform_tariff_invoices (
  id varchar(160) primary key,
  subscription_id uuid not null,
  owner_user_id uuid not null references users(id),
  tariff_series_id varchar(160) not null,
  tariff_version integer not null,
  tariff_version_digest varchar(71) not null,
  amount_minor integer not null,
  currency text not null,
  state text not null,
  version integer not null default 1,
  billing_period_start_at timestamptz not null,
  billing_period_end_at timestamptz not null,
  created_at timestamptz not null default now(),
  captured_at timestamptz,
  voided_at timestamptz,
  unique (subscription_id, billing_period_start_at),
  foreign key (subscription_id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest)
    references platform_tariff_subscriptions(id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest)
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
