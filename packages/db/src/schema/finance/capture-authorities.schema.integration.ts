import { randomUUID } from "node:crypto";

import { canonicalizeFinanceCommandPayload, hashFinanceCommandPayload } from "@elevenhouse/domain";
import {
  createOrderEconomicsSnapshot,
  createRiskPolicySnapshot
} from "@elevenhouse/domain/finance-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { financeCaptureAuthoritiesIntegritySql } from "./capture-authorities.schema";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_capture_authority_${randomUUID().replaceAll("-", "")}`;
if (!/^elevenhouse_capture_authority_[0-9a-f]{32}$/.test(databaseName)) {
  throw new Error("Invalid isolated capture-authority test database name");
}
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);

describe.sequential("capture authority PostgreSQL canonical parity", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    await pool.query(minimalCaptureAuthoritySchemaSql);
    await pool.query(financeCaptureAuthoritiesIntegritySql);
  }, 30_000);

  afterAll(async () => {
    try {
      await pool?.end();
      await adminClient.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("matches TypeScript canonical bytes and digests for every immutable snapshot", async () => {
    const economics = createOrderEconomicsSnapshot({
      orderId: "order-authority-1",
      astrologerUserId: "11111111-1111-4111-8111-111111111111",
      planId: "start",
      planVersionId: "start-v3",
      gross: { amountMinor: 10_000, currency: "RUB" },
      commission: { amountMinor: 400, currency: "RUB" },
      payable: { amountMinor: 9_600, currency: "RUB" },
      commissionBps: 400,
      allocationRevision: "bps_half_up_v1"
    });
    const risk = createRiskPolicySnapshot({
      id: "risk-standard",
      policyVersion: 3,
      effectiveRiskTier: "standard",
      holdAnchor: "booking_completed",
      holdDurationHours: 48,
      reserveBps: 1_000,
      reserveReleaseDelayDays: 30,
      providerSettlementRequired: true,
      payoutMinimum: { amountMinor: 100, currency: "RUB" },
      exceptionAuthority: null,
      effectiveAt: "2026-07-01T00:00:00Z"
    });
    const fulfillment = Object.freeze({
      supported: true as const,
      registryKey: "single.once.live.solo",
      registryRevision: 1,
      holdAnchor: "booking_completed" as const,
      terminalEvidence: Object.freeze({
        owner: "booking" as const,
        status: "completed" as const,
        contractVersion: 1
      }),
      cancellationAllocator: Object.freeze({
        owner: "booking" as const,
        port: "BookingCancellationRefundDecisionPort" as const,
        policyVersion: 1
      })
    });

    const economicsRow = await pool.query<CaptureAuthorityRow>(
      `insert into finance_order_economics_snapshots
         (order_id, astrologer_user_id, plan_id, plan_version_id,
          gross_amount_minor, gross_currency, commission_amount_minor, commission_currency,
          payable_amount_minor, payable_currency, commission_bps, allocation_revision,
          canonical_digest)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       returning canonical_preimage, canonical_digest, persisted_at`,
      [
        economics.orderId,
        economics.astrologerUserId,
        economics.planId,
        economics.planVersionId,
        economics.gross.amountMinor,
        economics.gross.currency,
        economics.commission.amountMinor,
        economics.commission.currency,
        economics.payable.amountMinor,
        economics.payable.currency,
        economics.commissionBps,
        economics.allocationRevision,
        hashFinanceCommandPayload(economics)
      ]
    );
    assertParity(economicsRow.rows[0], economics);

    const riskRow = await insertRiskAuthority(pool, risk);
    assertParity(riskRow.rows[0], risk);
    const exceptionalRisk = createRiskPolicySnapshot({
      ...risk,
      id: "risk-reviewed-exception",
      policyVersion: 4,
      exceptionAuthority: { id: "manual-risk-exception-1", version: 2 },
      effectiveAt: "2026-07-01T00:00:00.123456789Z"
    });
    const exceptionalRiskRow = await insertRiskAuthority(pool, exceptionalRisk);
    assertParity(exceptionalRiskRow.rows[0], exceptionalRisk);

    const fulfillmentRow = await pool.query<CaptureAuthorityRow>(
      `insert into finance_paid_product_fulfillment_decisions
         (supported, registry_key, registry_revision, hold_anchor,
          terminal_evidence_owner, terminal_evidence_status,
          terminal_evidence_contract_version, cancellation_allocator_owner,
          cancellation_allocator_port, cancellation_allocator_policy_version, canonical_digest)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning canonical_preimage, canonical_digest, persisted_at`,
      [
        fulfillment.supported,
        fulfillment.registryKey,
        fulfillment.registryRevision,
        fulfillment.holdAnchor,
        fulfillment.terminalEvidence.owner,
        fulfillment.terminalEvidence.status,
        fulfillment.terminalEvidence.contractVersion,
        fulfillment.cancellationAllocator.owner,
        fulfillment.cancellationAllocator.port,
        fulfillment.cancellationAllocator.policyVersion,
        hashFinanceCommandPayload(fulfillment)
      ]
    );
    assertParity(fulfillmentRow.rows[0], fulfillment);
  });

  it("sorts Unicode keys, preserves array order and rejects non-integer numbers", async () => {
    const value = {
      "😀": [3, { z: null, a: true }, [], {}],
      a: 'quote" slash/ backslash\\ line\nseparator\u2028',
      é: -2
    };
    const result = await pool.query<{ canonical: string }>(
      `select finance_canonical_jsonb_v1($1::jsonb) as canonical`,
      [JSON.stringify(value)]
    );

    expect(result.rows[0]?.canonical).toBe(canonicalText(value));
    await expect(
      pool.query(`select finance_canonical_jsonb_v1('{"amount":1.5}'::jsonb)`)
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("rejects a caller digest that does not match the scalar snapshot", async () => {
    await expect(
      pool.query(
        `insert into finance_order_economics_snapshots
           (order_id, astrologer_user_id, plan_id, plan_version_id,
            gross_amount_minor, gross_currency, commission_amount_minor, commission_currency,
            payable_amount_minor, payable_currency, commission_bps, allocation_revision,
            canonical_digest)
         values ('order-forged', '11111111-1111-4111-8111-111111111111', 'start', 'start-v3',
                 10000, 'RUB', 400, 'RUB', 9600, 'RUB', 400, 'bps_half_up_v1', $1)`,
        [`sha256:${"f".repeat(64)}`]
      )
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("compiles and enforces the exact 13-field payable-lot capture owner", async () => {
    const artifactDigest = `sha256:${"a".repeat(64)}`;
    const values = [
      "capture-fact-1",
      "intent-1",
      "session-1",
      "arc-series-live",
      "arc-account-live",
      1,
      "provider-payment-1",
      "10000",
      "RUB",
      "provider_operation_result",
      "provider-result-1",
      "artifact-1",
      artifactDigest
    ];
    await pool.query(
      `insert into finance_capture_facts
         (id, economic_payment_intent_id, economic_payment_session_id, series_id,
          provider_account_id, provider_identity_version, provider_payment_id, amount_minor,
          currency, evidence_authority_kind, evidence_authority_id, evidence_artifact_id,
          evidence_artifact_digest)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      values
    );
    await expect(
      pool.query(
        `insert into finance_payable_lots
           (lot_id, canonical_capture_evidence_id, capture_intent_id, capture_session_id,
            provider_account_series_id, provider_account_id, provider_identity_version,
            provider_payment_id, capture_amount_minor, capture_currency,
            capture_evidence_authority_kind, capture_evidence_authority_id,
            capture_evidence_artifact_id, capture_evidence_artifact_digest)
         values ('lot-exact', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        values
      )
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query(
        `insert into finance_payable_lots
           (lot_id, canonical_capture_evidence_id, capture_intent_id, capture_session_id,
            provider_account_series_id, provider_account_id, provider_identity_version,
            provider_payment_id, capture_amount_minor, capture_currency,
            capture_evidence_authority_kind, capture_evidence_authority_id,
            capture_evidence_artifact_id, capture_evidence_artifact_digest)
         values ('lot-cross-wired', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [...values.slice(0, 12), `sha256:${"b".repeat(64)}`]
      )
    ).rejects.toMatchObject({ code: "23503" });
  });
});

type CaptureAuthorityRow = {
  canonical_preimage: string;
  canonical_digest: string;
  persisted_at: Date;
};

function assertParity(row: CaptureAuthorityRow | undefined, value: unknown): void {
  expect(row).toBeDefined();
  expect(row?.canonical_preimage).toBe(canonicalText(value));
  expect(row?.canonical_digest).toBe(hashFinanceCommandPayload(value));
  expect(row?.persisted_at).toBeInstanceOf(Date);
}

function canonicalText(value: unknown): string {
  return new TextDecoder().decode(canonicalizeFinanceCommandPayload(value));
}

async function insertRiskAuthority(pool: Pool, risk: ReturnType<typeof createRiskPolicySnapshot>) {
  return pool.query<CaptureAuthorityRow>(
    `insert into finance_risk_policy_versions
       (policy_id, policy_version, effective_risk_tier, hold_anchor, hold_duration_hours,
        reserve_bps, reserve_release_delay_days, provider_settlement_required,
        payout_minimum_amount_minor, payout_minimum_currency, exception_authority_id,
        exception_authority_version, effective_at, canonical_digest)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     returning canonical_preimage, canonical_digest, persisted_at`,
    [
      risk.id,
      risk.policyVersion,
      risk.effectiveRiskTier,
      risk.holdAnchor,
      risk.holdDurationHours,
      risk.reserveBps,
      risk.reserveReleaseDelayDays,
      risk.providerSettlementRequired,
      risk.payoutMinimum.amountMinor,
      risk.payoutMinimum.currency,
      risk.exceptionAuthority?.id ?? null,
      risk.exceptionAuthority?.version ?? null,
      risk.effectiveAt,
      hashFinanceCommandPayload(risk)
    ]
  );
}

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  return assertDevelopmentDatabaseUrl(
    value,
    process.env.NODE_ENV,
    "compile capture authority canonical SQL"
  );
}

function withDatabaseName(connectionString: string, nextDatabaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${nextDatabaseName}`;
  return url.toString();
}

const minimalCaptureAuthoritySchemaSql = `
create table finance_order_economics_snapshots (
  order_id varchar(200) primary key,
  astrologer_user_id uuid not null,
  plan_id varchar(200) not null,
  plan_version_id varchar(200) not null,
  gross_amount_minor numeric(38,0) not null,
  gross_currency text not null,
  commission_amount_minor numeric(38,0) not null,
  commission_currency text not null,
  payable_amount_minor numeric(38,0) not null,
  payable_currency text not null,
  commission_bps integer not null,
  allocation_revision text not null,
  canonical_preimage text not null default '',
  canonical_digest varchar(71) not null default '',
  persisted_at timestamptz not null default now()
);

create table finance_risk_policy_versions (
  policy_id varchar(160) not null,
  policy_version numeric(38,0) not null,
  effective_risk_tier text not null,
  hold_anchor text not null,
  hold_duration_hours integer not null,
  reserve_bps integer not null,
  reserve_release_delay_days integer not null,
  provider_settlement_required boolean not null,
  payout_minimum_amount_minor numeric(38,0) not null,
  payout_minimum_currency text not null,
  exception_authority_id varchar(200),
  exception_authority_version numeric(38,0),
  effective_at varchar(40) not null,
  canonical_preimage text not null default '',
  canonical_digest varchar(71) not null default '',
  persisted_at timestamptz not null default now(),
  primary key (policy_id, policy_version)
);

create table finance_paid_product_fulfillment_decisions (
  supported boolean not null,
  registry_key varchar(200) not null,
  registry_revision numeric(38,0) not null,
  hold_anchor text not null,
  terminal_evidence_owner text not null,
  terminal_evidence_status text not null,
  terminal_evidence_contract_version numeric(38,0) not null,
  cancellation_allocator_owner text not null,
  cancellation_allocator_port text not null,
  cancellation_allocator_policy_version numeric(38,0) not null,
  canonical_preimage text not null default '',
  canonical_digest varchar(71) not null default '',
  persisted_at timestamptz not null default now(),
  primary key (registry_key, registry_revision)
);

create table finance_capture_facts (
  id varchar(160) primary key,
  economic_payment_intent_id varchar(160) not null,
  economic_payment_session_id varchar(160) not null,
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  provider_payment_id varchar(160) not null,
  amount_minor numeric(38,0) not null,
  currency text not null,
  evidence_authority_kind text not null,
  evidence_authority_id varchar(160) not null,
  evidence_artifact_id varchar(160) not null,
  evidence_artifact_digest varchar(71) not null,
  unique (
    id, economic_payment_intent_id, economic_payment_session_id, series_id,
    provider_account_id, provider_identity_version, provider_payment_id, amount_minor,
    currency, evidence_authority_kind, evidence_authority_id, evidence_artifact_id,
    evidence_artifact_digest
  )
);

create table finance_payable_lots (
  lot_id varchar(200) primary key,
  canonical_capture_evidence_id varchar(160) not null,
  capture_intent_id varchar(160) not null,
  capture_session_id varchar(160) not null,
  provider_account_series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  provider_payment_id varchar(160) not null,
  capture_amount_minor numeric(38,0) not null,
  capture_currency text not null,
  capture_evidence_authority_kind text not null,
  capture_evidence_authority_id varchar(160) not null,
  capture_evidence_artifact_id varchar(160) not null,
  capture_evidence_artifact_digest varchar(71) not null,
  foreign key (
    canonical_capture_evidence_id, capture_intent_id, capture_session_id,
    provider_account_series_id, provider_account_id, provider_identity_version,
    provider_payment_id, capture_amount_minor, capture_currency,
    capture_evidence_authority_kind, capture_evidence_authority_id,
    capture_evidence_artifact_id, capture_evidence_artifact_digest
  ) references finance_capture_facts (
    id, economic_payment_intent_id, economic_payment_session_id, series_id,
    provider_account_id, provider_identity_version, provider_payment_id, amount_minor,
    currency, evidence_authority_kind, evidence_authority_id, evidence_artifact_id,
    evidence_artifact_digest
  ) on delete restrict
);
`;
