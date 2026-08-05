import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { platformTariffAuthorityIntegritySql } from "./tariff-authority.schema";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_tariff_authority_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);

describe.sequential("platform tariff authority PostgreSQL invariants", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    await pool.query(minimalTariffAuthoritySchemaSql);
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

  it("allows deleting an unused draft instead of silently suppressing the delete", async () => {
    await seedVersion(pool, { seriesId: "draft-delete", version: 1, lifecycle: "draft" });

    await expect(
      pool.query("delete from platform_tariff_versions where tariff_series_id = $1 and version = 1", [
        "draft-delete"
      ])
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query("select count(*)::int as count from platform_tariff_versions where tariff_series_id = $1", [
        "draft-delete"
      ])
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it("seals a published tariff and its capability set while allowing only retirement", async () => {
    await seedVersion(pool, { seriesId: "sealed", version: 1, lifecycle: "draft" });
    await pool.query(
      "insert into platform_tariff_version_capabilities (tariff_series_id, tariff_version, capability) values ('sealed', 1, 'reports')"
    );
    await pool.query(
      "update platform_tariff_versions set lifecycle = 'published', published_at = clock_timestamp() where tariff_series_id = 'sealed' and version = 1"
    );

    await expect(
      pool.query(
        "update platform_tariff_versions set monthly_price_minor = 1 where tariff_series_id = 'sealed' and version = 1"
      )
    ).rejects.toMatchObject({ code: "55000", message: expect.stringContaining("immutable") });
    await expect(
      pool.query(
        "delete from platform_tariff_version_capabilities where tariff_series_id = 'sealed' and tariff_version = 1"
      )
    ).rejects.toMatchObject({ code: "55000", message: expect.stringContaining("immutable") });
    await expect(
      pool.query(
        "update platform_tariff_versions set lifecycle = 'retired', retired_at = clock_timestamp() where tariff_series_id = 'sealed' and version = 1"
      )
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it("rejects commission and invoice snapshot tampering at the database boundary", async () => {
    await seedVersion(pool, { seriesId: "snapshot", version: 1, lifecycle: "published" });
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const anotherOwnerId = "22222222-2222-4222-8222-222222222222";
    const subscriptionId = "33333333-3333-4333-8333-333333333333";
    await pool.query("insert into users (id) values ($1), ($2)", [ownerId, anotherOwnerId]);

    await expect(
      pool.query(
        `insert into platform_tariff_subscriptions (
           id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest,
           commission_bps_snapshot, billing_cycle, state
         ) values ($1, $2, 'snapshot', 1, $3, 799, 'month', 'incomplete_setup')`,
        [subscriptionId, ownerId, digest("a")]
      )
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("commission") });
    await pool.query(
      `insert into platform_tariff_subscriptions (
         id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest,
         commission_bps_snapshot, billing_cycle, state
       ) values ($1, $2, 'snapshot', 1, $3, 800, 'month', 'incomplete_setup')`,
      [subscriptionId, ownerId, digest("a")]
    );
    await expect(
      pool.query(
        `insert into platform_tariff_invoices (
           id, subscription_id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest,
           amount_minor, currency, state, billing_period_start_at, billing_period_end_at
         ) values ('invoice-wrong-owner', $1, $2, 'snapshot', 1, $3, 2500, 'RUB', 'open', clock_timestamp(), clock_timestamp() + interval '1 month')`,
        [subscriptionId, anotherOwnerId, digest("a")]
      )
    ).rejects.toMatchObject({ code: "23503" });
    await pool.query(
      `insert into platform_tariff_invoices (
         id, subscription_id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest,
         amount_minor, currency, state, billing_period_start_at, billing_period_end_at
       ) values ('invoice-correct', $1, $2, 'snapshot', 1, $3, 2500, 'RUB', 'open', clock_timestamp(), clock_timestamp() + interval '1 month')`,
      [subscriptionId, ownerId, digest("a")]
    );
    await expect(
      pool.query(
        `insert into platform_tariff_invoices (
           id, subscription_id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest,
           amount_minor, currency, state, billing_period_start_at, billing_period_end_at
         ) values ('invoice-duplicate-period', $1, $2, 'snapshot', 1, $3, 2500, 'RUB', 'open',
           (select billing_period_start_at from platform_tariff_invoices where id = 'invoice-correct'),
           (select billing_period_end_at from platform_tariff_invoices where id = 'invoice-correct'))`,
        [subscriptionId, ownerId, digest("a")]
      )
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool.query("update platform_tariff_invoices set amount_minor = 1 where id = 'invoice-correct'")
    ).rejects.toMatchObject({ code: "55000", message: expect.stringContaining("immutable") });
  });

  it("rejects a new active subscription that cites an unpublished tariff version", async () => {
    await seedVersion(pool, { seriesId: "unpublished", version: 1, lifecycle: "draft" });
    const ownerId = "44444444-4444-4444-8444-444444444444";
    await pool.query("insert into users (id) values ($1)", [ownerId]);

    await expect(
      pool.query(
        `insert into platform_tariff_subscriptions (
           id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest,
           commission_bps_snapshot, billing_cycle, state, starts_at, ends_at
         ) values ('55555555-5555-4555-8555-555555555555', $1, 'unpublished', 1, $2, 800,
           'month', 'active', clock_timestamp(), clock_timestamp() + interval '1 month')`,
        [ownerId, digest("a")]
      )
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("published") });
  });

  it("does not allow a paid tariff to become active without a captured period invoice", async () => {
    await seedVersion(pool, { seriesId: "paid-without-capture", version: 1, lifecycle: "published" });
    const ownerId = "66666666-6666-4666-8666-666666666666";
    await pool.query("insert into users (id) values ($1)", [ownerId]);

    await expect(
      pool.query(
        `insert into platform_tariff_subscriptions (
           id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest,
           commission_bps_snapshot, billing_cycle, state, starts_at, ends_at
         ) values ('77777777-7777-4777-8777-777777777777', $1, 'paid-without-capture', 1, $2, 800,
           'month', 'active', clock_timestamp(), clock_timestamp() + interval '1 month')`,
        [ownerId, digest("a")]
      )
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("captured invoice") });
  });

  it("allows a paid selection to wait for saved-card setup before creating its initial invoice", async () => {
    await seedVersion(pool, { seriesId: "setup-first", version: 1, lifecycle: "published" });
    const ownerId = "88888888-8888-4888-8888-888888888888";
    const subscriptionId = "99999999-9999-4999-8999-999999999999";
    await pool.query("insert into users (id) values ($1)", [ownerId]);
    await pool.query(
      `insert into platform_tariff_subscriptions (
         id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest,
         commission_bps_snapshot, billing_cycle, state
       ) values ($1, $2, 'setup-first', 1, $3, 800, 'month', 'incomplete_setup')`,
      [subscriptionId, ownerId, digest("a")]
    );
    await expect(
      pool.query(
        "update platform_tariff_subscriptions set state = 'awaiting_initial_payment', version = version + 1 where id = $1",
        [subscriptionId]
      )
    ).resolves.toMatchObject({ rowCount: 1 });
  });
});

async function seedVersion(
  pool: Pool,
  input: Readonly<{ seriesId: string; version: number; lifecycle: "draft" | "published" }>
): Promise<void> {
  await pool.query("insert into platform_tariff_series (id, code) values ($1, $1)", [input.seriesId]);
  await pool.query(
    `insert into platform_tariff_versions (
       tariff_series_id, version, draft_revision, lifecycle, name, tagline, monthly_price_minor,
       yearly_price_minor, monthly_recurring_frequency_days, yearly_recurring_frequency_days,
       currency, client_sale_commission_bps, is_popular, display_order,
       canonical_preimage, canonical_digest, published_at
     ) values ($1, $2, 1, $3, 'Pro', 'For active practice', 2500, 25000, 31, 365, 'RUB', 800, false, 0,
       '{"tariff":"pro"}', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
       case when $3 = 'published' then clock_timestamp() else null end)`,
    [input.seriesId, input.version, input.lifecycle]
  );
}

const minimalTariffAuthoritySchemaSql = `
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

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}
