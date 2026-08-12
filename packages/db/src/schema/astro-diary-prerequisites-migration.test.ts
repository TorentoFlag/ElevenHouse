import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { astroDiaryImmutableEvidenceSql } from "./astro-diary";

type MigrationJournal = Readonly<{
  entries: readonly Readonly<{ idx: number; tag: string }>[];
}>;

type MigrationSnapshot = Readonly<{
  id: string;
  prevId: string;
  tables: Readonly<
    Record<
      string,
      Readonly<{
        checkConstraints: Readonly<Record<string, Readonly<{ value: string }>>>;
      }>
    >
  >;
}>;

const migrationDirectory = join(process.cwd(), "packages/db/drizzle");
const metadataDirectory = join(migrationDirectory, "meta");
const baseline = readSnapshot("0037_snapshot.json");
const mobile = readSnapshot("0038_snapshot.json");
const prerequisites = readSnapshot("0039_snapshot.json");
const diary = readSnapshot("0040_snapshot.json");
const openingAllowanceFact = readSnapshot("0041_snapshot.json");
const clientFollowUpTransition = readSnapshot("0042_snapshot.json");
const initialReadCursor = readSnapshot("0043_snapshot.json");

describe("AstroDiary prerequisite forward migrations", () => {
  it("keeps 0038 focused on mobile device sessions and auth security events", () => {
    const journal = readJournal();
    expect(journal.entries.slice(-6)).toEqual([
      expect.objectContaining({ idx: 38, tag: "0038_mobile_device_sessions" }),
      expect.objectContaining({ idx: 39, tag: "0039_astro_diary" }),
      expect.objectContaining({ idx: 40, tag: "0040_smiling_thunderbolt" }),
      expect.objectContaining({ idx: 41, tag: "0041_early_vision" }),
      expect.objectContaining({
        idx: 42,
        tag: "0042_astro-diary-client-follow-up-transition"
      }),
      expect.objectContaining({ idx: 43, tag: "0043_flawless_talisman" })
    ]);
    expect(mobile.prevId).toBe(baseline.id);

    expect(addedTables(baseline, mobile)).toEqual([
      "public.mobile_refresh_retry_receipts",
      "public.mobile_refresh_tokens",
      "public.mobile_sessions"
    ]);
    expect(changedExistingTables(baseline, mobile)).toEqual(["public.auth_security_events"]);
    expect(mediaPurposeCheck(mobile)).toBe(mediaPurposeCheck(baseline));

    const sql = readMigration("0038_mobile_device_sessions.sql");
    expect(sql).toContain('CREATE TABLE "mobile_sessions"');
    expect(sql).toContain('CREATE TABLE "mobile_refresh_tokens"');
    expect(sql).toContain('CREATE TABLE "mobile_refresh_retry_receipts"');
    expect(sql).toContain("mobile_validate_session_family");
    expect(sql).toContain("refresh_token_reuse_detected");
    expect(sql).not.toContain('CREATE TABLE "client_subscription_contracts"');
    expect(sql).not.toContain('ALTER TABLE "media_assets"');
    expect(sql).not.toContain('ALTER TABLE "products" ADD COLUMN "revision"');
  });

  it("keeps Product, ClientSubscriptions and Media prerequisites in 0039", () => {
    expect(prerequisites.prevId).toBe(mobile.id);
    expect(addedTables(mobile, prerequisites)).toEqual([
      "public.client_entitlement_grants",
      "public.client_entitlement_transition_applications",
      "public.client_entitlement_transition_effects",
      "public.client_subscription_allowance_command_effects",
      "public.client_subscription_allowance_command_receipts",
      "public.client_subscription_allowance_consumptions",
      "public.client_subscription_allowance_reservations",
      "public.client_subscription_command_receipts",
      "public.client_subscription_contracts",
      "public.client_subscription_creation_receipts",
      "public.client_subscription_event_application_receipts",
      "public.client_subscription_lifecycle_events",
      "public.client_subscription_period_allowances",
      "public.client_subscription_periods",
      "public.client_subscription_purchase_authorities",
      "public.client_subscription_renewal_requests",
      "public.client_subscription_slots",
      "public.client_subscription_transition_receipts",
      "public.client_subscriptions"
    ]);
    expect(changedExistingTables(mobile, prerequisites)).toEqual([
      "public.media_assets",
      "public.orders",
      "public.outbox_events",
      "public.product_access_grants",
      "public.product_delivery_formats",
      "public.products"
    ]);
    expect(mediaPurposeCheck(prerequisites)).not.toBe(mediaPurposeCheck(mobile));
    expect(mediaPurposeCheck(prerequisites)).toContain("astro_diary_attachment");
    expect(mediaPurposeCheck(prerequisites)).toContain("astro_diary_voice");
    expect(mediaPurposeCheck(prerequisites)).toContain("astro_diary_export_pdf");

    const sql = readMigration("0039_astro_diary.sql");
    const normalized = sql.toLowerCase();
    for (const requiredFragment of [
      'create table "client_subscription_contracts"',
      'create table "client_subscriptions"',
      'create table "client_subscription_periods"',
      'create table "client_subscription_period_allowances"',
      'create table "client_entitlement_grants"',
      'add column "revision" integer default 1 not null',
      'add column "astro_diary_reflection_cycles_per_period" integer',
      "orders_exact_subscription_identity_unique",
      "product_access_grants_product_order_unique",
      "product_delivery_formats_product_order_unique",
      "outbox_events_client_subscription_lifecycle_dispatch_check",
      "astro_diary_attachment",
      "astro_diary_voice",
      "astro_diary_export_pdf"
    ]) {
      expect(normalized).toContain(requiredFragment);
    }
    expect(sql).not.toMatch(/CREATE TABLE "astro_diary_/);
    expect(sql).not.toContain('CREATE TABLE "mobile_sessions"');
    expect(sql).not.toContain("mobile_validate_session_family");

    const orderIdentityConstraint = normalized.indexOf(
      'alter table "orders" add constraint "orders_exact_subscription_identity_unique"'
    );
    const firstOrderIdentityReference = normalized.indexOf(
      'alter table "client_subscription_contracts" add constraint "client_subscription_contracts_order_identity_fk"'
    );
    expect(orderIdentityConstraint).toBeGreaterThan(-1);
    expect(firstOrderIdentityReference).toBeGreaterThan(orderIdentityConstraint);

    const finalGeneratedConstraint = normalized.indexOf(
      'alter table "products" add constraint "products_astro_diary_service_timezone_check"'
    );
    const productIntegrity = normalized.indexOf(
      "create or replace function elevenhouse_assert_astro_diary_product_integrity()"
    );
    const periodExclusion = normalized.indexOf("create extension if not exists btree_gist");
    const subscriptionIntegrity = normalized.indexOf("create extension if not exists pgcrypto");
    expect(finalGeneratedConstraint).toBeGreaterThan(-1);
    expect(productIntegrity).toBeGreaterThan(finalGeneratedConstraint);
    expect(periodExclusion).toBeGreaterThan(productIntegrity);
    expect(subscriptionIntegrity).toBeGreaterThan(periodExclusion);
    expect(normalized.indexOf("finance_canonical_jsonb_v1", subscriptionIntegrity)).toBeGreaterThan(
      subscriptionIntegrity
    );
  });

  it("keeps the first AstroDiary schema and its integrity SQL focused in 0040", () => {
    expect(diary.prevId).toBe(prerequisites.id);
    const diaryTables = addedTables(prerequisites, diary);
    expect(diaryTables).toHaveLength(40);
    expect(diaryTables.every((tableName) => tableName.startsWith("public.astro_diary_"))).toBe(
      true
    );
    expect(changedExistingTables(prerequisites, diary)).toEqual([]);

    const sql = readMigration("0040_smiling_thunderbolt.sql");
    const normalized = sql.toLowerCase();
    expect([...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1])).toHaveLength(40);
    expect(sql).not.toContain('CREATE TABLE "mobile_sessions"');
    expect(sql).not.toContain('CREATE TABLE "client_subscriptions"');
    expect(sql).not.toContain('ALTER TABLE "products"');
    expect(sql).not.toContain('ALTER TABLE "media_assets"');

    const immutableEvidence = normalized.indexOf(
      "create or replace function astro_diary_guard_immutable_evidence()"
    );
    const graphIntegrity = normalized.indexOf(
      "create or replace function astro_diary_validate_media_asset_authority()"
    );
    const outboxIntegrity = normalized.indexOf(
      "alter table outbox_events add constraint outbox_events_astro_diary_dispatch_payload_check"
    );
    const finalGeneratedIndex = normalized.indexOf(
      'create index "astro_diary_timeline_items_journal_cursor_idx"'
    );
    expect(finalGeneratedIndex).toBeGreaterThan(-1);
    expect(immutableEvidence).toBeGreaterThan(finalGeneratedIndex);
    expect(graphIntegrity).toBeGreaterThan(immutableEvidence);
    expect(outboxIntegrity).toBeGreaterThan(graphIntegrity);
  });

  it("adds the direct-consumption opening allowance fact as a focused forward correction", () => {
    expect(openingAllowanceFact.prevId).toBe(diary.id);
    expect(addedTables(diary, openingAllowanceFact)).toEqual([]);
    expect(changedExistingTables(diary, openingAllowanceFact)).toEqual([
      "public.astro_diary_cycle_opening_allowance_facts"
    ]);
    const sql = readMigration("0041_early_vision.sql");
    expect(sql).toContain('ADD COLUMN "opening_allowance_consumption_id" uuid');
    expect(sql).toContain("astro_diary_cycle_opening_allowance_facts_consumption_fk");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION astro_diary_validate_cycle_opening_allowance_fact()"
    );
    expect(sql).toContain("fact_row.opening_allowance_consumption_id IS NULL");
  });

  it("allows the client follow-up to atomically enter the closing-response state", () => {
    expect(clientFollowUpTransition.prevId).toBe(openingAllowanceFact.id);
    expect(addedTables(openingAllowanceFact, clientFollowUpTransition)).toEqual([]);
    expect(changedExistingTables(openingAllowanceFact, clientFollowUpTransition)).toEqual([]);

    const sql = readMigration("0042_astro-diary-client-follow-up-transition.sql").toLowerCase();
    expect(sql).toContain("create or replace function astro_diary_guard_versioned_head()");
    expect(sql).toContain(
      "old.state = 'awaiting_client_follow_up'\n          and new.state in ('awaiting_astrologer_response', 'awaiting_astrologer_closing_response', 'closed')"
    );
    expect(normalizedSqlFunction(sql, "astro_diary_guard_versioned_head")).toBe(
      normalizedSqlFunction(astroDiaryImmutableEvidenceSql, "astro_diary_guard_versioned_head")
    );
  });

  it("adds only the explicit absent-head read cursor CAS precondition", () => {
    expect(initialReadCursor.prevId).toBe(clientFollowUpTransition.id);
    expect(addedTables(clientFollowUpTransition, initialReadCursor)).toEqual([]);
    expect(changedExistingTables(clientFollowUpTransition, initialReadCursor)).toEqual([
      "public.astro_diary_command_preconditions"
    ]);
    const sql = readMigration("0043_flawless_talisman.sql");
    expect(sql).toContain('ALTER COLUMN "expected_version" DROP NOT NULL');
    expect(sql).toContain("aggregate\" = 'read_cursor'");
    expect(sql).toContain('"expected_version" is null');
  });
});

function readJournal(): MigrationJournal {
  return JSON.parse(
    readFileSync(join(metadataDirectory, "_journal.json"), "utf8")
  ) as MigrationJournal;
}

function readSnapshot(fileName: string): MigrationSnapshot {
  return JSON.parse(readFileSync(join(metadataDirectory, fileName), "utf8")) as MigrationSnapshot;
}

function readMigration(fileName: string): string {
  return readFileSync(join(migrationDirectory, fileName), "utf8");
}

function addedTables(before: MigrationSnapshot, after: MigrationSnapshot): readonly string[] {
  return Object.keys(after.tables)
    .filter((tableName) => !(tableName in before.tables))
    .sort();
}

function changedExistingTables(
  before: MigrationSnapshot,
  after: MigrationSnapshot
): readonly string[] {
  return Object.keys(before.tables)
    .filter(
      (tableName) =>
        tableName in after.tables &&
        stableJson(before.tables[tableName]) !== stableJson(after.tables[tableName])
    )
    .sort();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizedSqlFunction(sql: string, name: string): string {
  const start = sql.toLowerCase().indexOf(`create or replace function ${name}()`);
  if (start < 0) throw new Error(`Expected ${name} in SQL`);
  const end = sql.indexOf("$$;", start);
  if (end < 0) throw new Error(`Expected ${name} function terminator`);
  return sql
    .slice(start, end + 3)
    .toLowerCase()
    .replace(/\s+/g, "");
}

function mediaPurposeCheck(snapshot: MigrationSnapshot): string {
  const value =
    snapshot.tables["public.media_assets"]?.checkConstraints["media_assets_purpose_check"]?.value;
  if (!value) throw new Error("Expected media_assets_purpose_check in migration snapshot");
  return value;
}
