import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { financeSavedCardConsentIntegritySql } from "./saved-card-consents.schema";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_saved_card_consent_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const consentId = "saved-card-consent-one";
const consentVersion = "1";

describe.sequential("saved-card consent PostgreSQL invariants", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    await pool.query(minimalSavedCardConsentSchemaSql);
    await pool.query(financeSavedCardConsentIntegritySql);
    await seedGrantedConsent(pool);
  }, 30_000);

  afterAll(async () => {
    try {
      await pool?.end();
      await adminClient.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("requires the exact granted event and matching head before a consent becomes usable", async () => {
    await seedConsentWithoutHead(pool, "saved-card-consent-without-head");
    await expect(
      pool.query(
        `insert into finance_saved_card_consent_lifecycle_events
           (id, consent_id, consent_version, event_sequence, lifecycle, reason_code, occurred_at)
         values ('33333333-3333-4333-8333-333333333333', 'saved-card-consent-without-head', 1, 1, 'granted', null, clock_timestamp())`
      )
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("matching head") });

    const head = await pool.query(
      `select current_lifecycle, lifecycle_event_sequence, head_version
       from finance_saved_card_consent_heads
       where consent_id = $1 and consent_version = $2`,
      [consentId, consentVersion]
    );
    expect(head.rows).toEqual([
      { current_lifecycle: "granted", lifecycle_event_sequence: "1", head_version: "1" }
    ]);
  });

  it("allows only a CAS-like granted-to-revoked transition and never reactivates the consent", async () => {
    await pool.query("begin");
    try {
      await pool.query(
        `insert into finance_saved_card_consent_lifecycle_events
           (id, consent_id, consent_version, event_sequence, lifecycle, reason_code, occurred_at)
         values ('44444444-4444-4444-8444-444444444444', $1, $2, 2, 'revoked', 'customer_withdrew_consent', clock_timestamp())`,
        [consentId, consentVersion]
      );
      await pool.query(
        `update finance_saved_card_consent_heads
         set current_lifecycle = 'revoked', lifecycle_event_sequence = 2, head_version = 2
         where consent_id = $1 and consent_version = $2 and head_version = 1`,
        [consentId, consentVersion]
      );
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }

    await expect(
      pool.query(
        `insert into finance_saved_card_consent_lifecycle_events
           (id, consent_id, consent_version, event_sequence, lifecycle, reason_code, occurred_at)
         values ('55555555-5555-4555-8555-555555555555', $1, $2, 3, 'granted', null, clock_timestamp())`,
        [consentId, consentVersion]
      )
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("not allowed") });
    await expect(
      pool.query(
        `update finance_saved_card_consent_heads
         set current_lifecycle = 'granted', lifecycle_event_sequence = 1, head_version = 3
         where consent_id = $1 and consent_version = $2`,
        [consentId, consentVersion]
      )
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("only advance") });
  });

  it("does not let later code alter the accepted commercial or disclosure evidence", async () => {
    await expect(
      pool.query(
        `update finance_saved_card_consents
         set disclosure_digest = $3
         where consent_id = $1 and consent_version = $2`,
        [consentId, consentVersion, digest("b")]
      )
    ).rejects.toMatchObject({ code: "55000", message: expect.stringContaining("append-only") });
  });
});

async function seedGrantedConsent(pool: Pool): Promise<void> {
  const ownerUserId = "11111111-1111-4111-8111-111111111111";
  const subscriptionId = "22222222-2222-4222-8222-222222222222";
  await pool.query(
    `insert into platform_tariff_subscriptions
       (id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest)
     values ($1, $2, 'pro', 1, $3)`,
    [subscriptionId, ownerUserId, digest("a")]
  );
  await pool.query(
    `insert into finance_provider_accounts (series_id, provider_account_id, identity_version)
     values ('arc-main', 'arc-account-main', 1)`
  );
  await pool.query("begin");
  try {
    await pool.query(
      `insert into finance_saved_card_consents
       (consent_id, consent_version, subscription_id, owner_user_id, tariff_series_id, tariff_version,
        tariff_version_digest, series_id, provider_account_id, provider_identity_version, provider_customer_id,
        consent_scope, notice_locale, disclosure_digest)
       values ($1, $2, $3, $4, 'pro', 1, $5, 'arc-main', 'arc-account-main', 1, 'customer-1',
         'platform_tariff_saved_card_and_recurring_charge', 'ru', $6)`,
      [consentId, consentVersion, subscriptionId, ownerUserId, digest("a"), digest("d")]
    );
    await pool.query(
      `insert into finance_saved_card_consent_lifecycle_events
       (id, consent_id, consent_version, event_sequence, lifecycle, reason_code, occurred_at)
       values ('66666666-6666-4666-8666-666666666666', $1, $2, 1, 'granted', null, clock_timestamp())`,
      [consentId, consentVersion]
    );
    await pool.query(
      `insert into finance_saved_card_consent_heads
       (consent_id, consent_version, current_lifecycle, lifecycle_event_sequence, head_version)
       values ($1, $2, 'granted', 1, 1)`,
      [consentId, consentVersion]
    );
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

async function seedConsentWithoutHead(pool: Pool, nextConsentId: string): Promise<void> {
  await pool.query(
    `insert into finance_saved_card_consents
     (consent_id, consent_version, subscription_id, owner_user_id, tariff_series_id, tariff_version,
      tariff_version_digest, series_id, provider_account_id, provider_identity_version, provider_customer_id,
      consent_scope, notice_locale, disclosure_digest)
     select $1, 1, subscription_id, owner_user_id, tariff_series_id, tariff_version,
       tariff_version_digest, series_id, provider_account_id, provider_identity_version, 'customer-no-head',
       consent_scope, notice_locale, disclosure_digest
     from finance_saved_card_consents
     where consent_id = $2 and consent_version = 1`,
    [nextConsentId, consentId]
  );
}

const minimalSavedCardConsentSchemaSql = `
create table platform_tariff_subscriptions (
  id uuid primary key,
  owner_user_id uuid not null,
  tariff_series_id varchar(160) not null,
  tariff_version integer not null,
  tariff_version_digest varchar(71) not null,
  unique (id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest)
);
create table finance_provider_accounts (
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  identity_version integer not null,
  primary key (series_id, provider_account_id, identity_version)
);
create table finance_saved_card_consents (
  consent_id varchar(160) not null,
  consent_version numeric(38, 0) not null,
  subscription_id uuid not null,
  owner_user_id uuid not null,
  tariff_series_id varchar(160) not null,
  tariff_version integer not null,
  tariff_version_digest varchar(71) not null,
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  provider_customer_id varchar(160) not null,
  consent_scope text not null,
  notice_locale varchar(8) not null,
  disclosure_digest varchar(71) not null,
  accepted_at timestamptz not null default now(),
  primary key (consent_id, consent_version),
  foreign key (subscription_id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest)
    references platform_tariff_subscriptions(id, owner_user_id, tariff_series_id, tariff_version, tariff_version_digest),
  foreign key (series_id, provider_account_id, provider_identity_version)
    references finance_provider_accounts(series_id, provider_account_id, identity_version)
);
create table finance_saved_card_consent_lifecycle_events (
  id uuid primary key,
  consent_id varchar(160) not null,
  consent_version numeric(38, 0) not null,
  event_sequence numeric(38, 0) not null,
  lifecycle text not null,
  reason_code varchar(160),
  occurred_at timestamptz not null,
  unique (consent_id, consent_version, event_sequence),
  unique (consent_id, consent_version, event_sequence, lifecycle),
  foreign key (consent_id, consent_version)
    references finance_saved_card_consents(consent_id, consent_version)
);
create table finance_saved_card_consent_heads (
  consent_id varchar(160) not null,
  consent_version numeric(38, 0) not null,
  current_lifecycle text not null,
  lifecycle_event_sequence numeric(38, 0) not null,
  head_version numeric(38, 0) not null,
  updated_at timestamptz not null default now(),
  primary key (consent_id, consent_version),
  foreign key (consent_id, consent_version)
    references finance_saved_card_consents(consent_id, consent_version),
  foreign key (consent_id, consent_version, lifecycle_event_sequence, current_lifecycle)
    references finance_saved_card_consent_lifecycle_events(consent_id, consent_version, event_sequence, lifecycle)
);
`;

function digest(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV ?? "development", "integration-test");
  return value;
}

function withDatabaseName(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
