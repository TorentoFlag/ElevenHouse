import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertDevelopmentDatabaseUrl } from "../../connection";

const schemaSource = readFileSync(
  join(__dirname, "client-subscription-capture-dispatch.schema.ts"),
  "utf8"
);
const migrationSource = readFileSync(
  join(__dirname, "../../../drizzle/0047_nebulous_lord_hawal.sql"),
  "utf8"
);

describe("client-subscription capture dispatch schema preparation", () => {
  it("keeps the finance receipt immutable and binds the initial/renewal authority outputs", () => {
    expect(schemaSource).toContain('uuid("capture_application_receipt_id").notNull()');
    expect(schemaSource).toContain('varchar("source_event_digest", { length: 71 }).notNull()');
    expect(schemaSource).toContain(
      "finance_client_subscription_capture_dispatch_receipts_immutable"
    );
    expect(schemaSource).toContain(
      "client_subscription_capture_dispatch_receipt_capture_kind_check"
    );
    expect(schemaSource).toContain(
      "client_subscription_capture_dispatch_receipt_output_ids_check"
    );
    expect(schemaSource).toContain(
      "finance_assert_client_subscription_capture_dispatch_receipt"
    );
    expect(schemaSource).toContain(
      "capture_row.canonical_digest <> new.capture_application_digest"
    );
    expect(schemaSource).toContain(
      "contract_row.canonical_digest <> new.contract_canonical_digest"
    );
    expect(schemaSource).toContain(
      "new.primary_lifecycle_event_id"
    );
    expect(schemaSource).toContain(
      "new.entitlement_changed_event_id"
    );
    expect(schemaSource).toContain(
      "new.canonical_digest <> 'sha256:' || encode"
    );
    expect(schemaSource).toContain(
      "finance_issue_client_subscription_capture_dispatch_receipt"
    );
    expect(schemaSource).toContain(
      "client_subscription_event_application_receipts"
    );
    expect(schemaSource).toContain(
      "application_row.result_version <> new.subscription_expected_version + 1"
    );
    expect(schemaSource).toContain("new.captured_at := capture_row.observed_at");
    expect(schemaSource).toContain("new.canonical_preimage := finance_canonical_jsonb_v1");
    expect(schemaSource).toContain(
      "finance_assert_client_subscription_capture_dispatch_installation"
    );
  });

  it("keeps the capture dispatch foreign key on the v2 online-sale application authority", () => {
    expect(migrationSource).toContain(
      'REFERENCES "public"."finance_online_sale_capture_applications"("id")'
    );
    expect(migrationSource).not.toContain(
      'REFERENCES "public"."finance_verified_capture_application_receipts"("receipt_id")'
    );
  });
});

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe.sequential : describe.skip;
const databaseName = `elevenhouse_capture_dispatch_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = integrationDatabaseUrl
  ? withDatabaseName(
      assertDevelopmentDatabaseUrl(
        integrationDatabaseUrl,
        process.env.NODE_ENV,
        "client subscription capture dispatch preparation"
      ),
      databaseName
    )
  : "";
const integritySql = sourceSql("clientSubscriptionCaptureDispatchIntegritySql");

describeWithDatabase("client-subscription capture dispatch preparation PostgreSQL integrity", () => {
  const admin = integrationDatabaseUrl ? new Client({ connectionString: integrationDatabaseUrl }) : undefined;
  const client = databaseUrl ? new Client({ connectionString: databaseUrl }) : undefined;

  beforeAll(async () => {
    await admin!.connect();
    await admin!.query(`create database "${databaseName}"`);
    await client!.connect();
    await client!.query(fixtureSql());
    await client!.query(integritySql);
  }, 30_000);

  afterAll(async () => {
    try {
      await client?.end();
      await admin?.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await admin?.end();
    }
  }, 30_000);

  it("rejects a receipt whose source application authority has a mismatched result version", async () => {
    const authority = await seedAuthority(client!, { resultVersion: 9 });

    await expect(insertDispatchReceipt(client!, authority)).rejects.toThrow(
      "client subscription capture dispatch receipt source application authority is inconsistent"
    );
  });

  it("reconstructs capture time and canonical evidence server-side, and its install audit detects a dropped immutable trigger", async () => {
    const authority = await seedAuthority(client!, { resultVersion: 2 });
    const inserted = await insertDispatchReceipt(client!, authority, {
      canonicalPreimage: "caller-controlled-preimage",
      canonicalDigest: digest("caller-controlled-preimage"),
      capturedAt: "2099-01-01T00:00:00.000Z"
    });
    const stored = inserted.rows[0]!;

    expect(new Date(stored.captured_at).toISOString()).toBe("2026-08-12T09:10:00.000Z");
    expect(stored.canonical_preimage).not.toBe("caller-controlled-preimage");
    expect(stored.canonical_digest).toBe(digest(stored.canonical_preimage));
    const canonical = JSON.parse(stored.canonical_preimage) as Record<string, unknown>;
    expect(canonical).toMatchObject({
      schemaVersion: "finance-client-subscription-capture-dispatch-receipt.v1",
      sourceEventId: authority.sourceEventId,
      sourceEventDigest: authority.sourceEventDigest,
      captureApplicationReceiptId: authority.captureApplicationReceiptId,
      applicationResultVersion: 2,
      transitionId: authority.transitionId,
      capturedAt: expect.any(String)
    });
    expect(new Date(String(canonical.capturedAt)).toISOString()).toBe("2026-08-12T09:10:00.000Z");

    await client!.query(
      "drop trigger finance_client_subscription_capture_dispatch_receipts_immutable on finance_client_subscription_capture_dispatch_receipts"
    );
    await expect(
      client!.query("select finance_assert_client_subscription_capture_dispatch_installation()")
    ).rejects.toThrow("client subscription capture dispatch receipt integrity installation is incomplete");
  });
});

function sourceSql(name: string): string {
  const start = schemaSource.indexOf("const " + name + " = `");
  const end = start < 0 ? -1 : schemaSource.indexOf("\n`;", start);
  if (start < 0 || end < 0) throw new Error(`Missing ${name} source SQL`);
  return schemaSource.slice(start + (`const ${name} = \``).length, end);
}

function withDatabaseName(connectionString: string, name: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${name}`;
  return url.toString();
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

type Authority = Readonly<{
  captureApplicationReceiptId: string;
  captureApplicationDigest: string;
  orderId: string;
  contractId: string;
  contractCanonicalDigest: string;
  subscriptionId: string;
  sourceEventId: string;
  sourceEventDigest: string;
  periodId: string;
  primaryLifecycleEventId: string;
  entitlementChangedEventId: string;
  transitionId: string;
}>;

async function seedAuthority(
  client: Client,
  input: Readonly<{ resultVersion: number }>
): Promise<Authority> {
  const authority: Authority = {
    captureApplicationReceiptId: randomUUID(),
    captureApplicationDigest: digest(`capture-${randomUUID()}`),
    orderId: randomUUID(),
    contractId: randomUUID(),
    contractCanonicalDigest: digest(`contract-${randomUUID()}`),
    subscriptionId: randomUUID(),
    sourceEventId: randomUUID(),
    sourceEventDigest: digest(`source-${randomUUID()}`),
    periodId: randomUUID(),
    primaryLifecycleEventId: randomUUID(),
    entitlementChangedEventId: randomUUID(),
    transitionId: randomUUID()
  };
  await client.query(
    `insert into finance_online_sale_capture_applications
      (id,canonical_digest,economic_payment_intent_id,semantic_fact_id)
     values ($1,$2,$3,$4)`,
    [
      authority.captureApplicationReceiptId,
      authority.captureApplicationDigest,
      `intent-${authority.captureApplicationReceiptId}`,
      `semantic-${authority.captureApplicationReceiptId}`
    ]
  );
  await client.query(
    `insert into finance_economic_payment_intents (id,source_id)
     values ($1,$2)`,
    [`intent-${authority.captureApplicationReceiptId}`, authority.orderId]
  );
  await client.query(
    `insert into finance_provider_semantic_facts (id,observed_at)
     values ($1,'2026-08-12T09:10:00.000Z')`,
    [`semantic-${authority.captureApplicationReceiptId}`]
  );
  await client.query(
    "insert into client_subscription_contracts (id,order_id,canonical_digest) values ($1,$2,$3)",
    [authority.contractId, authority.orderId, authority.contractCanonicalDigest]
  );
  await client.query(
    "insert into client_subscription_periods (id,subscription_id,capture_evidence_id) values ($1,$2,$3)",
    [authority.periodId, authority.subscriptionId, authority.captureApplicationReceiptId]
  );
  await client.query(
    `insert into client_subscription_event_application_receipts
      (source_event_id,source_event_digest,evidence_id,subscription_id,result_kind,result_version,transition_id)
     values ($1,$2,$3,$4,'applied',$5,$6)`,
    [
      authority.sourceEventId,
      authority.sourceEventDigest,
      authority.captureApplicationReceiptId,
      authority.subscriptionId,
      input.resultVersion,
      authority.transitionId
    ]
  );
  await client.query(
    `insert into client_subscription_lifecycle_events
     (id,transition_id,subscription_id,contract_id,subscription_version,event_type,data)
     values ($1,$2,$3,$4,$5,'client_subscription.activated.v1',jsonb_build_object('periodId',$6::text)),
            ($7,$2,$3,$4,$5,'client_subscription.entitlement_changed.v1',jsonb_build_object('scope','period','periodId',$6::text))`,
    [
      authority.primaryLifecycleEventId,
      authority.transitionId,
      authority.subscriptionId,
      authority.contractId,
      input.resultVersion,
      authority.periodId,
      authority.entitlementChangedEventId
    ]
  );
  return authority;
}

async function insertDispatchReceipt(
  client: Client,
  authority: Authority,
  overrides: Readonly<{ canonicalPreimage?: string; canonicalDigest?: string; capturedAt?: string }> = {}
) {
  const canonicalPreimage = overrides.canonicalPreimage ?? "caller-preimage";
  return client.query<Readonly<{ captured_at: string; canonical_preimage: string; canonical_digest: string }>>(
    `insert into finance_client_subscription_capture_dispatch_receipts
      (dispatch_receipt_id,capture_application_receipt_id,capture_application_digest,order_id,contract_id,
       contract_canonical_digest,subscription_id,subscription_expected_version,capture_kind,source_event_id,
       source_event_digest,period_id,primary_lifecycle_event_id,entitlement_changed_event_id,
       canonical_preimage,canonical_digest,captured_at,dispatched_at)
     values ($1,$2,$3,$4,$5,$6,$7,1,'initial',$8,$9,$10,$11,$12,$13,$14,$15,'2099-01-01T00:01:00.000Z')
     returning captured_at::text,canonical_preimage,canonical_digest`,
    [
      randomUUID(),
      authority.captureApplicationReceiptId,
      authority.captureApplicationDigest,
      authority.orderId,
      authority.contractId,
      authority.contractCanonicalDigest,
      authority.subscriptionId,
      authority.sourceEventId,
      authority.sourceEventDigest,
      authority.periodId,
      authority.primaryLifecycleEventId,
      authority.entitlementChangedEventId,
      canonicalPreimage,
      overrides.canonicalDigest ?? digest(canonicalPreimage),
      overrides.capturedAt ?? "2099-01-01T00:00:00.000Z"
    ]
  );
}

function fixtureSql(): string {
  return `
    create extension if not exists pgcrypto;
    create or replace function finance_canonical_jsonb_v1(input_value jsonb)
    returns text language sql immutable strict as $$ select input_value::text $$;
    create table finance_economic_payment_intents (
      id text primary key, source_id text not null
    );
    create table finance_provider_semantic_facts (
      id text primary key, observed_at timestamptz not null
    );
    create table finance_online_sale_capture_applications (
      id uuid primary key, canonical_digest varchar(71) not null,
      economic_payment_intent_id text not null, semantic_fact_id text not null
    );
    create table client_subscription_contracts (
      id uuid primary key, order_id uuid not null, canonical_digest varchar(71) not null
    );
    create table client_subscription_renewal_requests (
      id uuid primary key, subscription_id uuid not null, intended_period_id uuid not null
    );
    create table client_subscription_periods (
      id uuid primary key, subscription_id uuid not null, capture_evidence_id uuid not null
    );
    create table client_subscription_lifecycle_events (
      id uuid primary key, transition_id uuid not null, subscription_id uuid not null,
      contract_id uuid not null, subscription_version integer not null, event_type text not null, data jsonb not null
    );
    create table client_subscription_event_application_receipts (
      source_event_id uuid primary key, source_event_digest varchar(71) not null, evidence_id uuid not null,
      subscription_id uuid not null, result_kind text not null, result_version integer not null, transition_id uuid
    );
    create table finance_client_subscription_capture_dispatch_receipts (
      dispatch_receipt_id uuid primary key, capture_application_receipt_id uuid not null,
      capture_application_digest varchar(71) not null, order_id uuid not null, contract_id uuid not null,
      contract_canonical_digest varchar(71) not null, subscription_id uuid not null,
      subscription_expected_version integer not null, capture_kind text not null, renewal_request_id uuid,
      intended_period_id uuid, source_event_id uuid not null, source_event_digest varchar(71) not null,
      period_id uuid not null, primary_lifecycle_event_id uuid not null,
      entitlement_changed_event_id uuid not null, canonical_preimage text not null,
      canonical_digest varchar(71) not null, captured_at timestamptz not null, dispatched_at timestamptz not null,
      constraint client_subscription_capture_dispatch_receipt_capture_kind_check check (true),
      constraint client_subscription_capture_dispatch_receipt_output_ids_check check (true)
    );`;
}
