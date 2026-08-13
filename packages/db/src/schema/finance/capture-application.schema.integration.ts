import { randomUUID } from "node:crypto";

import { canonicalizeFinanceCommandPayload, hashFinanceCommandPayload } from "@elevenhouse/domain";
import type { ApplyVerifiedCaptureCommand } from "@elevenhouse/domain/finance-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type PoolClient, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  createDrizzleVerifiedCaptureApplicationUnitOfWork,
  deriveVerifiedCapturePersistenceIds
} from "../../adapters/finance/drizzle-verified-capture-application-uow";
import { financeVerifiedCaptureApplicationIntegritySql } from "./capture-application.schema";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_capture_application_${randomUUID().replaceAll("-", "")}`;
if (!/^elevenhouse_capture_application_[0-9a-f]{32}$/.test(databaseName)) {
  throw new Error("Invalid isolated capture-application test database name");
}
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);

describe.sequential("verified capture application PostgreSQL authority", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    await pool.query(minimalCaptureApplicationSchemaSql);
    await pool.query(financeVerifiedCaptureApplicationIntegritySql);
  }, 30_000);

  afterAll(async () => {
    try {
      await pool?.end();
      await adminClient.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("issues receipt/outbox IDs and closes the exact payable capture graph in one XID", async () => {
    const fixture = await seedPrerequisites(pool, {
      purpose: "client_order",
      operationKind: "checkout_session_create",
      amountMinor: "10000",
      commissionMinor: "400",
      payableMinor: "9600"
    });
    const callerReceiptId = randomUUID();
    const callerOutboxId = randomUUID();
    const receipt = await applyCapture(pool, fixture, { callerReceiptId, callerOutboxId });

    expect(receipt.receipt_id).not.toBe(callerReceiptId);
    expect(receipt.outbox_event_id).not.toBe(callerOutboxId);
    expect(receipt.root_payable_lot_id).toBe(fixture.rootLotId);
    expect(receipt.astrologer_user_id).toBe(fixture.astrologerUserId);
    expect(receipt.risk_policy_id).toBe(fixture.riskPolicyId);
    expect(receipt.fulfillment_decision_id).toBe(fixture.fulfillmentDecisionId);
    expect(receipt.clearing_state).toBe("unmatched");
    expect(receipt.clearing_version).toBe("1");

    const canonicalValue = JSON.parse(receipt.canonical_preimage) as unknown;
    expect(canonicalText(canonicalValue)).toBe(receipt.canonical_preimage);
    expect(hashFinanceCommandPayload(canonicalValue)).toBe(receipt.canonical_digest);

    const event = await pool.query<{
      id: string;
      event_type: string;
      aggregate_id: string;
      payload: { captureApplicationReceiptId: string };
      status: string;
      attempts: number;
    }>(
      `select id, event_type, aggregate_id, payload, status, attempts
       from outbox_events where id = $1`,
      [receipt.outbox_event_id]
    );
    expect(event.rows).toEqual([
      {
        id: receipt.outbox_event_id,
        event_type: "finance.economic_payment.capture_applied",
        aggregate_id: receipt.receipt_id,
        payload: { captureApplicationReceiptId: receipt.receipt_id },
        status: "pending",
        attempts: 0
      }
    ]);

    const xidProof = await pool.query<Record<string, string>>(
      `select
         substring(application.persistence_transaction_boundary_ref from '[0-9]+$')::xid8::xid::text as boundary_xid,
         application.xmin::text as application_xid,
         intent.xmin::text as intent_xid,
         session.xmin::text as session_xid,
         transition_fact.xmin::text as transition_xid,
         capture.xmin::text as capture_xid,
         clearing.xmin::text as clearing_xid,
         event.xmin::text as outbox_xid,
         journal_receipt.xmin::text as journal_receipt_xid,
         wallet_binding.xmin::text as wallet_binding_xid,
         root_lot.xmin::text as root_lot_xid
       from finance_verified_capture_application_receipts application
       join finance_economic_payment_intents intent
         on intent.id = application.economic_payment_intent_id
       join finance_economic_payment_sessions session
         on session.id = application.economic_payment_session_id
       join finance_payment_transition_facts transition_fact
         on transition_fact.id = application.capture_transition_fact_id
       join finance_capture_facts capture on capture.id = application.capture_fact_id
       join finance_payment_clearing_heads clearing
         on clearing.economic_payment_intent_id = application.economic_payment_intent_id
       join outbox_events event on event.id = application.outbox_event_id
       join finance_persistence_commit_receipts journal_receipt
         on journal_receipt.receipt_id = application.journal_persistence_receipt_id
       join finance_wallet_commit_bindings wallet_binding
         on wallet_binding.commit_receipt_id = application.wallet_commit_receipt_id
       join finance_payable_lots root_lot on root_lot.lot_id = application.root_payable_lot_id
       where application.receipt_id = $1`,
      [receipt.receipt_id]
    );
    const proof = xidProof.rows[0];
    expect(proof).toBeDefined();
    expect(new Set(Object.values(proof ?? {}))).toEqual(new Set([proof?.boundary_xid]));
  });

  it("rolls back the complete capture when a balanced journal has the wrong economic meaning", async () => {
    const fixture = await seedPrerequisites(pool, {
      purpose: "client_order",
      operationKind: "checkout_session_create",
      amountMinor: "10000",
      commissionMinor: "400",
      payableMinor: "9600"
    });
    const before = await graphCounts(pool, fixture);

    await expect(applyCapture(pool, fixture, { wrongJournal: true })).rejects.toMatchObject({
      code: "23514",
      message: expect.stringContaining("exact economic posting")
    });
    await expect(graphCounts(pool, fixture)).resolves.toEqual(before);
  });

  it("rejects a standalone capture fact at the deferred reverse guard", async () => {
    const marker = uniqueMarker();
    await expect(
      pool.query(
        `insert into finance_capture_facts
           (id, economic_payment_intent_id, economic_payment_session_id, series_id,
            provider_account_id, provider_identity_version, provider_payment_id, amount_minor,
            currency, evidence_authority_kind, evidence_authority_id, evidence_artifact_id,
            evidence_artifact_digest, captured_at, committed_at)
         values ($1, $2, $3, 'arc-series-live', 'arc-account-live', 1, $4, 100, 'RUB',
                 'provider_operation_result', $5, $6, $7, $8, $8)`,
        [
          `capture-${marker}`,
          `intent-${marker}`,
          `session-${marker}`,
          `payment-${marker}`,
          `result-${marker}`,
          `artifact-${marker}`,
          digest("a"),
          observedAt
        ]
      )
    ).rejects.toMatchObject({
      code: "23514",
      message: expect.stringContaining("DB-issued verified application receipt")
    });
  });

  it("persists a zero-RUB card setup without journal or clearing but still emits capture outbox", async () => {
    const fixture = await seedPrerequisites(pool, {
      purpose: "platform_card_setup",
      operationKind: "card_setup",
      amountMinor: "0",
      commissionMinor: "0",
      payableMinor: "0"
    });
    const receipt = await applyCapture(pool, fixture);

    expect(receipt.amount_minor).toBe("0");
    expect(receipt.currency).toBe("RUB");
    expect(receipt.journal_persistence_receipt_id).toBeNull();
    expect(receipt.wallet_commit_receipt_id).toBeNull();
    expect(receipt.clearing_state).toBeNull();
    await expect(
      pool.query(`select count(*)::text as count from outbox_events where aggregate_id = $1`, [
        receipt.receipt_id
      ])
    ).resolves.toMatchObject({ rows: [{ count: "1" }] });
  });

  it("applies the zero-RUB card setup through the production Drizzle capture UoW", async () => {
    const fixture = await seedPrerequisites(pool, {
      purpose: "platform_card_setup",
      operationKind: "card_setup",
      amountMinor: "0",
      commissionMinor: "0",
      payableMinor: "0"
    });
    const database = drizzle(pool) as unknown as ElevenHouseDatabase;
    const unitOfWork = createDrizzleVerifiedCaptureApplicationUnitOfWork({ database });
    const receipt = await unitOfWork.applyVerifiedCapture(cardSetupCaptureCommand(fixture));

    expect(receipt.economicEffectKind).toBe("platform_card_setup_captured");
    expect(receipt.economicCaptureReceipt.effect.canonicalEvidenceId).toBe(
      deriveVerifiedCapturePersistenceIds(fixture.providerResultId).captureFactId
    );
    await expect(
      pool.query(
        `select state, version::text as version from finance_economic_payment_intents where id = $1`,
        [fixture.intentId]
      )
    ).resolves.toMatchObject({ rows: [{ state: "captured", version: "3" }] });
    await expect(
      pool.query(`select count(*)::text as count from outbox_events where aggregate_id = $1`, [
        receipt.ref.receiptId
      ])
    ).resolves.toMatchObject({ rows: [{ count: "1" }] });
    const replay = await unitOfWork.applyVerifiedCapture(cardSetupCaptureCommand(fixture));
    expect(replay.ref).toEqual(receipt.ref);
    await expect(
      pool.query(
        `select count(*)::text as count
         from finance_verified_capture_application_receipts
         where provider_result_receipt_id = $1`,
        [fixture.providerResultReceiptId]
      )
    ).resolves.toMatchObject({ rows: [{ count: "1" }] });
  });

  it("rolls back the adapter-owned card setup graph after an injected post-capture failure", async () => {
    const fixture = await seedPrerequisites(pool, {
      purpose: "platform_card_setup",
      operationKind: "card_setup",
      amountMinor: "0",
      commissionMinor: "0",
      payableMinor: "0"
    });
    const database = drizzle(pool) as unknown as ElevenHouseDatabase;
    const unitOfWork = createDrizzleVerifiedCaptureApplicationUnitOfWork({
      database,
      afterWriteBoundary: (boundary) => {
        if (boundary === "capture_fact") throw new Error("injected rollback proof");
      }
    });
    const before = await graphCounts(pool, fixture);

    await expect(unitOfWork.applyVerifiedCapture(cardSetupCaptureCommand(fixture))).rejects.toThrow(
      "injected rollback proof"
    );
    await expect(graphCounts(pool, fixture)).resolves.toEqual(before);
    await expect(
      pool.query(
        `select state, version::text as version from finance_economic_payment_intents where id = $1`,
        [fixture.intentId]
      )
    ).resolves.toMatchObject({ rows: [{ state: "checkout_opened", version: "2" }] });
  });

  it("allows the exact two-entry full-commission client journal without wallet authorities", async () => {
    const fixture = await seedPrerequisites(pool, {
      purpose: "client_order",
      operationKind: "checkout_session_create",
      amountMinor: "10000",
      commissionMinor: "10000",
      payableMinor: "0"
    });
    const receipt = await applyCapture(pool, fixture);

    expect(receipt.astrologer_user_id).toBe(fixture.astrologerUserId);
    expect(receipt.order_economics_digest).toBe(fixture.economicsDigest);
    expect(receipt.wallet_commit_receipt_id).toBeNull();
    expect(receipt.root_payable_lot_id).toBeNull();
    expect(receipt.risk_policy_id).toBeNull();
    expect(receipt.fulfillment_decision_id).toBeNull();
  });

  it("does not make a client capture depend on a provider-operation result", async () => {
    const fixture = await seedPrerequisites(pool, {
      purpose: "client_order",
      operationKind: "saved_card_charge",
      amountMinor: "10000",
      commissionMinor: "400",
      payableMinor: "9600"
    });
    const receipt = await applyCapture(pool, fixture);
    expect(receipt.provider_result_receipt_id).toBeNull();
    await expect(
      pool.query(
        `select provider_semantic_fact_id, provider_semantic_commit_receipt_id
           from finance_verified_capture_application_receipts where receipt_id = $1`,
        [receipt.receipt_id]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          provider_semantic_fact_id: fixture.semanticFactId,
          provider_semantic_commit_receipt_id: fixture.semanticCommitReceiptId
        }
      ]
    });
  });

  it("rejects a root lot owned by another astrologer", async () => {
    const fixture = await seedPrerequisites(pool, {
      purpose: "client_order",
      operationKind: "checkout_session_create",
      amountMinor: "10000",
      commissionMinor: "400",
      payableMinor: "9600"
    });
    await expect(applyCapture(pool, fixture, { wrongLotOwner: true })).rejects.toMatchObject({
      code: "23514"
    });
  });

  it("rejects a root lot that bypasses the pending capture hold", async () => {
    const fixture = await seedPrerequisites(pool, {
      purpose: "client_order",
      operationKind: "checkout_session_create",
      amountMinor: "10000",
      commissionMinor: "400",
      payableMinor: "9600"
    });
    await expect(applyCapture(pool, fixture, { wrongRootBucket: true })).rejects.toMatchObject({
      code: "23514",
      message: expect.stringContaining("exact persisted root lot")
    });
  });

  it("rejects a wallet mutation that is not owned by the canonical capture fact", async () => {
    const fixture = await seedPrerequisites(pool, {
      purpose: "client_order",
      operationKind: "checkout_session_create",
      amountMinor: "10000",
      commissionMinor: "400",
      payableMinor: "9600"
    });
    await expect(applyCapture(pool, fixture, { wrongWalletOperation: true })).rejects.toMatchObject(
      {
        code: "23514",
        message: expect.stringContaining("cross-wired")
      }
    );
  });

  it("prevents a second root lot for the same canonical capture", async () => {
    const fixture = await seedPrerequisites(pool, {
      purpose: "client_order",
      operationKind: "checkout_session_create",
      amountMinor: "10000",
      commissionMinor: "400",
      payableMinor: "9600"
    });
    await expect(applyCapture(pool, fixture, { duplicateRoot: true })).rejects.toMatchObject({
      code: "23505",
      constraint: "finance_payable_lots_one_root_per_capture_unique"
    });
  });
});

type CapturePurpose = "client_order" | "platform_invoice" | "platform_card_setup";
type OperationKind = "checkout_session_create" | "saved_card_charge" | "card_setup";

type Fixture = Readonly<{
  marker: string;
  purpose: CapturePurpose;
  operationKind: OperationKind;
  amountMinor: string;
  commissionMinor: string;
  payableMinor: string;
  intentId: string;
  sessionId: string;
  sourceId: string;
  transitionId: string;
  captureFactId: string;
  semanticFactId: string;
  semanticCommitReceiptId: string;
  providerResultReceiptId: string;
  providerResultId: string;
  providerOperationIntentId: string;
  providerOperationId: string;
  providerPaymentId: string;
  artifactId: string;
  artifactDigest: string;
  requestDigest: string;
  economicsDigest: string | null;
  astrologerUserId: string;
  otherAstrologerUserId: string;
  journalReceiptId: string;
  journalTransactionId: string;
  proofRecordId: string;
  proofId: string;
  walletCommitReceiptId: string;
  walletOperationId: string;
  walletOperationReceiptId: string;
  walletId: string;
  rootLotId: string;
  riskPolicyId: string;
  riskPolicyDigest: string;
  fulfillmentDecisionId: string;
  fulfillmentDecisionDigest: string;
}>;

type CaptureReceiptRow = {
  receipt_id: string;
  outbox_event_id: string;
  canonical_preimage: string;
  canonical_digest: `sha256:${string}`;
  amount_minor: string;
  currency: string;
  astrologer_user_id: string | null;
  order_economics_digest: string | null;
  root_payable_lot_id: string | null;
  risk_policy_id: string | null;
  fulfillment_decision_id: string | null;
  clearing_state: string | null;
  clearing_version: string | null;
  journal_persistence_receipt_id: string | null;
  wallet_commit_receipt_id: string | null;
  provider_result_receipt_id: string | null;
};

function cardSetupCaptureCommand(fixture: Fixture): ApplyVerifiedCaptureCommand {
  return {
    economicPaymentIntentId: fixture.intentId,
    expectedEconomicPaymentVersion: 2,
    providerOperationIntentId: fixture.providerOperationIntentId,
    expectedProviderOperationIntentVersion: 1,
    financialMutation: { kind: "no_posting", reason: "zero_amount_platform_card_setup" },
    providerResult: {
      kind: "provider_operation_result_commit_receipt",
      providerOperationResultId: fixture.providerResultId,
      providerOperationIntentId: fixture.providerOperationIntentId,
      providerOperationIntentVersion: 1,
      providerOperationId: fixture.providerOperationId,
      operationKind: "card_setup",
      economicPaymentIntentId: fixture.intentId,
      correlatedEconomicPaymentVersion: 2,
      economicPaymentSessionId: fixture.sessionId,
      sourceId: fixture.sourceId,
      purpose: "platform_card_setup",
      providerAccount: {
        seriesId: "arc-series-live",
        providerAccountId: "arc-account-live",
        identityVersion: 1
      },
      outcome: "succeeded",
      providerPaymentId: fixture.providerPaymentId,
      amountMinor: "0",
      currency: "RUB",
      evidenceArtifactId: fixture.artifactId,
      evidenceArtifactDigest: fixture.artifactDigest as `sha256:${string}`,
      canonicalRequestDigest: fixture.requestDigest as `sha256:${string}`,
      observedAt,
      persistenceTransactionBoundaryRef: "postgres-xid:101",
      committedAt: "2026-08-04T00:00:01.000Z"
    } as ApplyVerifiedCaptureCommand["providerResult"],
    operationEnvelope: {
      kind: "resolved_finance_operation_envelope",
      policyId: "capture-test-policy",
      policyVersion: 1,
      policyDigest: digest("e"),
      maximumRows: 64,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 2_097_152
    } as ApplyVerifiedCaptureCommand["operationEnvelope"]
  };
}

async function seedPrerequisites(
  pool: Pool,
  input: Readonly<{
    purpose: CapturePurpose;
    operationKind: OperationKind;
    amountMinor: string;
    commissionMinor: string;
    payableMinor: string;
  }>
): Promise<Fixture> {
  const marker = uniqueMarker();
  const fixture: Fixture = Object.freeze({
    marker,
    ...input,
    intentId: `intent-${marker}`,
    sessionId: `session-${marker}`,
    sourceId: `source-${marker}`,
    transitionId: `transition-${marker}`,
    captureFactId: `capture-${marker}`,
    semanticFactId: `semantic-capture-${marker}`,
    semanticCommitReceiptId: randomUUID(),
    providerResultReceiptId: randomUUID(),
    providerResultId: `result-${marker}`,
    providerOperationIntentId: `operation-intent-${marker}`,
    providerOperationId: `operation-${marker}`,
    providerPaymentId: `payment-${marker}`,
    artifactId: `artifact-${marker}`,
    artifactDigest: digest("a"),
    requestDigest: digest("b"),
    economicsDigest: input.purpose === "client_order" ? digest("c") : null,
    astrologerUserId: randomUUID(),
    otherAstrologerUserId: randomUUID(),
    journalReceiptId: `journal-receipt-${marker}`,
    journalTransactionId: `journal-${marker}`,
    proofRecordId: randomUUID(),
    proofId: `proof-${marker}`,
    walletCommitReceiptId: randomUUID(),
    walletOperationId: `capture-${marker}`,
    walletOperationReceiptId: `wallet-operation-receipt-${marker}`,
    walletId: randomUUID(),
    rootLotId: `root-lot-${marker}`,
    riskPolicyId: `risk-${marker}`,
    riskPolicyDigest: digest("d"),
    fulfillmentDecisionId: `fulfillment-${marker}`,
    fulfillmentDecisionDigest: digest("e")
  });
  await pool.query(
    `insert into finance_economic_payment_intents
       (id, purpose, source_id, series_id, provider_account_id, provider_identity_version,
        amount_minor, currency, state, version)
     values ($1, $2, $3, 'arc-series-live', 'arc-account-live', 1, $4, 'RUB', 'checkout_opened', 2)`,
    [fixture.intentId, fixture.purpose, fixture.sourceId, fixture.amountMinor]
  );
  await pool.query(
    `insert into finance_economic_payment_sessions
       (id, economic_payment_intent_id, series_id, provider_account_id,
        provider_identity_version, state, version, terminal_at)
     values ($1, $2, 'arc-series-live', 'arc-account-live', 1, 'checkout_opened', 1, null)`,
    [fixture.sessionId, fixture.intentId]
  );
  await pool.query(
    `insert into finance_provider_accounts
       (series_id, provider_account_id, identity_version, provider)
     values ('arc-series-live', 'arc-account-live', 1, 'arc_pay')
    on conflict do nothing`
  );
  if (fixture.purpose === "client_order") {
    await pool.query(
      `insert into finance_provider_semantic_facts
         (id, inbox_item_id, series_id, provider_account_id, provider_identity_version,
          economic_payment_intent_id, economic_payment_session_id, semantic_source_kind,
          semantic_source_id, provider_payment_id, amount_minor, currency, purpose,
          canonical_fact_digest, evidence_artifact_id, evidence_artifact_digest,
          effect_disposition, observed_at, committed_at)
       values ($1, $2, 'arc-series-live', 'arc-account-live', 1, $3, $4,
               'payment_transition', $5, $5, $6, 'RUB', 'client_order', $7, $8, $9,
               'applied_once', $10, '2026-08-04T00:00:01.000Z')`,
      [
        fixture.semanticFactId,
        `webhook-${fixture.marker}`,
        fixture.intentId,
        fixture.sessionId,
        fixture.providerPaymentId,
        fixture.amountMinor,
        fixture.requestDigest,
        fixture.artifactId,
        fixture.artifactDigest,
        observedAt
      ]
    );
    await pool.query(
      `insert into finance_webhook_semantic_commit_receipts
         (id, semantic_fact_id, inbox_item_id, processing_status, effect_disposition,
          semantic_source_kind, committed_at)
       values ($1, $2, $3, 'completed', 'applied_once', 'payment_transition',
               '2026-08-04T00:00:01.000Z')`,
      [fixture.semanticCommitReceiptId, fixture.semanticFactId, `webhook-${fixture.marker}`]
    );
  }
  if (fixture.purpose !== "client_order") {
    await pool.query(
      `insert into finance_provider_operation_intents
       (id, economic_payment_intent_id, correlated_economic_payment_version,
        economic_payment_session_id, series_id, provider_account_id, provider_identity_version,
        purpose, source_id, operation_kind, status, version, canonical_request_digest)
     values ($1, $2, 2, $3, 'arc-series-live', 'arc-account-live', 1,
             $4, $5, $6, 'succeeded', 1, $7)`,
      [
        fixture.providerOperationIntentId,
        fixture.intentId,
        fixture.sessionId,
        fixture.purpose,
        fixture.sourceId,
        fixture.operationKind,
        fixture.requestDigest
      ]
    );
    await pool.query(
      `insert into finance_provider_operation_result_commit_receipts
       (id, provider_operation_result_id, provider_operation_intent_id,
        provider_operation_intent_version, economic_payment_intent_id,
        correlated_economic_payment_version, economic_payment_session_id, purpose, source_id,
        operation_kind, series_id, provider_account_id, provider_identity_version, outcome,
        provider_operation_id, provider_payment_id, amount_minor, currency,
        canonical_request_digest, evidence_artifact_id, evidence_artifact_digest, observed_at,
        result_committed_at, canonical_preimage, canonical_digest,
        persistence_transaction_boundary_ref, committed_at)
     values ($1, $2, $3, 1, $4, 2, $5, $6, $7, $8,
             'arc-series-live', 'arc-account-live', 1, 'succeeded', $9, $10, $11, 'RUB',
             $12, $13, $14, $15, '2026-08-04T00:00:00.500Z',
             'provider-result-receipt-preimage', $16, 'postgres-xid:101', '2026-08-04T00:00:01.000Z')`,
      [
        fixture.providerResultReceiptId,
        fixture.providerResultId,
        fixture.providerOperationIntentId,
        fixture.intentId,
        fixture.sessionId,
        fixture.purpose,
        fixture.sourceId,
        fixture.operationKind,
        fixture.providerOperationId,
        fixture.providerPaymentId,
        fixture.amountMinor,
        fixture.requestDigest,
        fixture.artifactId,
        fixture.artifactDigest,
        observedAt,
        digest("d")
      ]
    );
  }
  if (fixture.purpose === "client_order") {
    await pool.query(
      `insert into finance_order_economics_snapshots
         (order_id, astrologer_user_id, gross_amount_minor, gross_currency,
          commission_amount_minor, payable_amount_minor, canonical_digest)
       values ($1, $2, $3, 'RUB', $4, $5, $6)`,
      [
        fixture.sourceId,
        fixture.astrologerUserId,
        fixture.amountMinor,
        fixture.commissionMinor,
        fixture.payableMinor,
        fixture.economicsDigest
      ]
    );
  }
  if (BigInt(fixture.payableMinor) > 0n) {
    await pool.query(
      `insert into finance_risk_policy_versions
         (policy_id, policy_version, canonical_digest) values ($1, 1, $2)`,
      [fixture.riskPolicyId, fixture.riskPolicyDigest]
    );
    await pool.query(
      `insert into finance_paid_product_fulfillment_decisions
         (registry_key, registry_revision, canonical_digest) values ($1, 1, $2)`,
      [fixture.fulfillmentDecisionId, fixture.fulfillmentDecisionDigest]
    );
  }
  return fixture;
}

async function applyCapture(
  pool: Pool,
  fixture: Fixture,
  options: Readonly<{
    callerReceiptId?: string;
    callerOutboxId?: string;
    wrongJournal?: boolean;
    wrongLotOwner?: boolean;
    wrongRootBucket?: boolean;
    wrongWalletOperation?: boolean;
    duplicateRoot?: boolean;
  }> = {}
): Promise<CaptureReceiptRow> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update finance_economic_payment_intents set state = 'captured', version = 3 where id = $1`,
      [fixture.intentId]
    );
    await client.query(
      `update finance_economic_payment_sessions
       set state = 'captured', version = 2, terminal_at = $2 where id = $1`,
      [fixture.sessionId, observedAt]
    );
    await client.query(
      `insert into finance_payment_transition_facts
         (id, economic_payment_intent_id, economic_payment_session_id, series_id,
          provider_account_id, provider_identity_version, to_state, authority_kind, authority_id,
          evidence_artifact_id, evidence_artifact_digest, intent_version_to, session_version_to)
       values ($1, $2, $3, 'arc-series-live', 'arc-account-live', 1, 'captured',
               $4, $5, $6, $7, 3, 2)`,
      [
        fixture.transitionId,
        fixture.intentId,
        fixture.sessionId,
        fixture.purpose === "client_order" ? "provider_semantic_fact" : "provider_operation_result",
        fixture.purpose === "client_order" ? fixture.semanticFactId : fixture.providerResultId,
        fixture.artifactId,
        fixture.artifactDigest
      ]
    );
    await client.query(
      `insert into finance_capture_facts
         (id, economic_payment_intent_id, economic_payment_session_id, series_id,
          provider_account_id, provider_identity_version, provider_payment_id, amount_minor,
          currency, evidence_authority_kind, evidence_authority_id, evidence_artifact_id,
          evidence_artifact_digest, captured_at, committed_at)
       values ($1, $2, $3, 'arc-series-live', 'arc-account-live', 1, $4, $5, 'RUB',
               $6, $7, $8, $9, $10, $10)`,
      [
        fixture.captureFactId,
        fixture.intentId,
        fixture.sessionId,
        fixture.providerPaymentId,
        fixture.amountMinor,
        fixture.purpose === "client_order" ? "provider_semantic_fact" : "provider_operation_result",
        fixture.purpose === "client_order" ? fixture.semanticFactId : fixture.providerResultId,
        fixture.artifactId,
        fixture.artifactDigest,
        observedAt
      ]
    );
    if (fixture.purpose !== "platform_card_setup") {
      await client.query(
        `insert into finance_payment_clearing_heads
           (economic_payment_intent_id, series_id, provider_account_id,
            provider_identity_version, currency, state, version)
         values ($1, 'arc-series-live', 'arc-account-live', 1, 'RUB', 'unmatched', 1)`,
        [fixture.intentId]
      );
    }

    if (fixture.purpose !== "platform_card_setup") {
      await insertJournal(client, fixture, options.wrongJournal === true);
    }
    if (BigInt(fixture.payableMinor) > 0n) {
      await insertWalletAndRoot(client, fixture, options);
    }

    const inserted = await client.query<CaptureReceiptRow>(
      `insert into finance_verified_capture_application_receipts
         (receipt_id, outbox_event_id, capture_fact_id, provider_result_receipt_id,
          provider_semantic_fact_id, provider_semantic_commit_receipt_id,
          journal_persistence_receipt_id, wallet_commit_receipt_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [
        options.callerReceiptId ?? randomUUID(),
        options.callerOutboxId ?? randomUUID(),
        fixture.captureFactId,
        fixture.purpose === "client_order" ? null : fixture.providerResultReceiptId,
        fixture.purpose === "client_order" ? fixture.semanticFactId : null,
        fixture.purpose === "client_order" ? fixture.semanticCommitReceiptId : null,
        fixture.purpose === "platform_card_setup" ? null : fixture.journalReceiptId,
        BigInt(fixture.payableMinor) > 0n ? fixture.walletCommitReceiptId : null
      ]
    );
    await client.query("commit");
    const row = inserted.rows[0];
    if (!row) throw new Error("Capture receipt was not returned");
    return row;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

async function insertJournal(
  client: PoolClient,
  fixture: Fixture,
  wrongJournal: boolean
): Promise<void> {
  const sourceIdentityId = randomUUID();
  const clearingAccountId = randomUUID();
  const astrologerAccountId = randomUUID();
  const platformAccountId = randomUUID();
  const isClient = fixture.purpose === "client_order";
  const hasPayable = BigInt(fixture.payableMinor) > 0n;
  const hasCommission = BigInt(fixture.commissionMinor) > 0n;
  const entryCount = 1 + Number(hasPayable) + Number(hasCommission || !isClient);
  const boundary = await currentBoundary(client);

  await client.query(
    `insert into finance_source_identities
       (id, source_kind, source_id, source_operation_key, source_scope_kind,
        provider_account_series_id, provider_account_id, provider_identity_version,
        astrologer_user_id)
     values ($1, $2, $3, $4, $5, 'arc-series-live', 'arc-account-live', 1, $6)`,
    [
      sourceIdentityId,
      isClient ? "order" : "platform_invoice",
      fixture.sourceId,
      isClient ? "sale_captured" : "captured",
      isClient ? "provider_account_and_astrologer" : "provider_account",
      isClient ? fixture.astrologerUserId : null
    ]
  );
  await client.query(
    `insert into finance_accounts
       (id, code, scope_kind, provider_account_series_id, provider_account_id,
        provider_identity_version, astrologer_user_id)
     values ($1, 'arc_provider_clearing', 'arc_provider_account',
             'arc-series-live', 'arc-account-live', 1, null)`,
    [clearingAccountId]
  );
  if (hasPayable) {
    await client.query(
      `insert into finance_accounts (id, code, scope_kind, astrologer_user_id)
       values ($1, $2, $3, $4)`,
      [
        astrologerAccountId,
        wrongJournal ? "platform_subscription_deferred" : "astrologer_pending",
        wrongJournal ? "platform" : "astrologer",
        wrongJournal ? null : fixture.astrologerUserId
      ]
    );
  }
  if (hasCommission || !isClient) {
    await client.query(
      `insert into finance_accounts (id, code, scope_kind)
       values ($1, $2, 'platform')`,
      [
        platformAccountId,
        isClient ? "platform_commission_deferred" : "platform_subscription_deferred"
      ]
    );
  }
  await client.query(
    `insert into finance_journal_transactions
       (id, source_identity_id, currency, entry_count, total_debit_minor,
        total_credit_minor, canonical_digest)
     values ($1, $2, 'RUB', $3, $4, $4, $5)`,
    [fixture.journalTransactionId, sourceIdentityId, entryCount, fixture.amountMinor, digest("f")]
  );
  let entryIndex = 0;
  await insertEntry(client, {
    fixture,
    accountId: clearingAccountId,
    entryIndex: entryIndex++,
    side: "debit",
    amountMinor: fixture.amountMinor,
    linkedSale: isClient
  });
  if (hasPayable) {
    await insertEntry(client, {
      fixture,
      accountId: astrologerAccountId,
      entryIndex: entryIndex++,
      side: "credit",
      amountMinor: fixture.payableMinor,
      linkedSale: isClient
    });
  }
  if (hasCommission || !isClient) {
    await insertEntry(client, {
      fixture,
      accountId: platformAccountId,
      entryIndex,
      side: "credit",
      amountMinor: isClient ? fixture.commissionMinor : fixture.amountMinor,
      linkedSale: isClient
    });
  }
  await client.query(
    `insert into finance_allocation_link_proofs (id, proof_id, version, proof_digest)
     values ($1, $2, 1, $3)`,
    [fixture.proofRecordId, fixture.proofId, digest("1")]
  );
  await client.query(
    `insert into finance_persistence_commit_receipts
       (receipt_id, journal_transaction_id, proof_record_id, canonical_digest,
        persistence_transaction_boundary_ref)
     values ($1, $2, $3, $4, $5)`,
    [
      fixture.journalReceiptId,
      fixture.journalTransactionId,
      fixture.proofRecordId,
      digest("2"),
      boundary
    ]
  );
}

async function insertEntry(
  client: PoolClient,
  input: Readonly<{
    fixture: Fixture;
    accountId: string;
    entryIndex: number;
    side: "debit" | "credit";
    amountMinor: string;
    linkedSale: boolean;
  }>
): Promise<void> {
  await client.query(
    `insert into finance_journal_entries
       (journal_transaction_id, entry_index, account_id, side, amount_minor, currency,
        original_sale_id, component_id)
     values ($1, $2, $3, $4, $5, 'RUB', $6, $7)`,
    [
      input.fixture.journalTransactionId,
      input.entryIndex,
      input.accountId,
      input.side,
      input.amountMinor,
      input.linkedSale ? input.fixture.sourceId : null,
      input.linkedSale ? `component-${input.entryIndex}-${input.fixture.marker}` : null
    ]
  );
}

async function insertWalletAndRoot(
  client: PoolClient,
  fixture: Fixture,
  options: Readonly<{
    wrongLotOwner?: boolean;
    wrongRootBucket?: boolean;
    wrongWalletOperation?: boolean;
    duplicateRoot?: boolean;
  }>
): Promise<void> {
  const astrologerUserId = options.wrongLotOwner
    ? fixture.otherAstrologerUserId
    : fixture.astrologerUserId;
  const walletOperationId = options.wrongWalletOperation
    ? `wrong-${fixture.walletOperationId}`
    : fixture.walletOperationId;
  const boundary = await currentBoundary(client);
  await client.query(
    `insert into finance_wallet_commit_bindings
       (commit_receipt_id, operation_id, operation_receipt_id,
        next_wallet_id, next_wallet_revision,
        commit_receipt_canonical_digest, persistence_transaction_boundary_ref,
        journal_persistence_receipt_id, journal_transaction_id, journal_transaction_digest,
        journal_link_proof_id, journal_link_proof_digest, astrologer_user_id)
     values ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      fixture.walletCommitReceiptId,
      walletOperationId,
      fixture.walletOperationReceiptId,
      fixture.walletId,
      digest("3"),
      boundary,
      fixture.journalReceiptId,
      fixture.journalTransactionId,
      digest("f"),
      fixture.proofId,
      digest("1"),
      astrologerUserId
    ]
  );
  await insertRootLot(
    client,
    fixture,
    fixture.rootLotId,
    astrologerUserId,
    walletOperationId,
    options.wrongRootBucket === true ? "available" : "pending"
  );
  if (options.duplicateRoot === true) {
    await insertRootLot(
      client,
      fixture,
      `${fixture.rootLotId}-duplicate`,
      astrologerUserId,
      walletOperationId,
      "pending"
    );
  }
}

async function insertRootLot(
  client: PoolClient,
  fixture: Fixture,
  lotId: string,
  astrologerUserId: string,
  walletOperationId: string,
  bucket: "available" | "pending"
): Promise<void> {
  await client.query(
    `insert into finance_payable_lots
       (lot_id, wallet_id, astrologer_user_id, root_lot_id, parent_lot_id, lineage_depth,
        original_sale_id, amount_minor, currency, bucket, captured_at, created_at,
        became_available_at, created_by_operation_id, created_by_receipt_id,
        created_effect_id, component_slot_id,
        capture_intent_id, capture_session_id, provider_account_series_id,
        provider_account_id, provider_identity_version, provider_payment_id,
        canonical_capture_evidence_id, capture_amount_minor, capture_currency,
        capture_evidence_authority_kind, capture_evidence_authority_id,
        capture_evidence_artifact_id, capture_evidence_artifact_digest,
        economics_snapshot_digest, risk_policy_id, risk_policy_version, risk_policy_digest,
        fulfillment_decision_id, fulfillment_decision_version, fulfillment_decision_digest)
     values ($1, $2, $3, $1, null, 0, $4, $5, 'RUB', $6, $7, $7,
             case when $6 = 'available' then $7::timestamptz else null end,
             $8, $9, $10, $11, $12, $13,
             'arc-series-live', 'arc-account-live', 1, $14, $15, $16, 'RUB',
             $17, $18, $19, $20, $21, $22, 1, $23, $24, 1, $25)`,
    [
      lotId,
      fixture.walletId,
      astrologerUserId,
      fixture.sourceId,
      fixture.payableMinor,
      bucket,
      observedAt,
      walletOperationId,
      fixture.walletOperationReceiptId,
      `${walletOperationId}:effect:1`,
      `${walletOperationId}:component-slot:1`,
      fixture.intentId,
      fixture.sessionId,
      fixture.providerPaymentId,
      fixture.captureFactId,
      fixture.amountMinor,
      fixture.purpose === "client_order" ? "provider_semantic_fact" : "provider_operation_result",
      fixture.purpose === "client_order" ? fixture.semanticFactId : fixture.providerResultId,
      fixture.artifactId,
      fixture.artifactDigest,
      fixture.economicsDigest,
      fixture.riskPolicyId,
      fixture.riskPolicyDigest,
      fixture.fulfillmentDecisionId,
      fixture.fulfillmentDecisionDigest
    ]
  );
}

async function graphCounts(pool: Pool, fixture: Fixture): Promise<Record<string, string>> {
  const result = await pool.query<Record<string, string>>(
    `select
       (select count(*)::text from finance_verified_capture_application_receipts
        where capture_fact_id = $1) as applications,
       (select count(*)::text from finance_capture_facts where id = $1) as captures,
       (select count(*)::text from outbox_events) as outbox,
       (select count(*)::text from finance_payment_transition_facts where id = $2) as transitions`,
    [fixture.captureFactId, fixture.transitionId]
  );
  return result.rows[0] ?? {};
}

async function currentBoundary(client: PoolClient): Promise<string> {
  const result = await client.query<{ boundary: string }>(
    `select 'postgres-xid:' || pg_current_xact_id()::text as boundary`
  );
  const boundary = result.rows[0]?.boundary;
  if (!boundary) throw new Error("Current transaction boundary is unavailable");
  return boundary;
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("rollback");
  } catch {
    // Preserve the authoritative PostgreSQL failure from the attempted commit.
  }
}

function digest(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function canonicalText(value: unknown): string {
  return new TextDecoder().decode(canonicalizeFinanceCommandPayload(value));
}

function uniqueMarker(): string {
  return randomUUID().replaceAll("-", "");
}

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  return assertDevelopmentDatabaseUrl(
    value,
    process.env.NODE_ENV,
    "compile verified capture application SQL"
  );
}

function withDatabaseName(connectionString: string, nextDatabaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${nextDatabaseName}`;
  return url.toString();
}

const observedAt = "2026-08-04T00:00:00.000Z";

const minimalCaptureApplicationSchemaSql = `
create extension if not exists pgcrypto;

create table outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0
);

create table finance_economic_payment_intents (
  id varchar(160) primary key,
  purpose text not null,
  source_id varchar(200) not null,
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  amount_minor numeric(38,0) not null,
  currency text not null,
  state text not null,
  version numeric(38,0) not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table finance_economic_payment_sessions (
  id varchar(160) primary key,
  economic_payment_intent_id varchar(160) not null,
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  state text not null,
  version numeric(38,0) not null,
  intent_version_opened numeric(38,0) not null default 2,
  opened_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  terminal_at timestamptz
);

create table finance_payment_transition_facts (
  id varchar(160) primary key,
  economic_payment_intent_id varchar(160) not null,
  economic_payment_session_id varchar(160) not null,
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  from_state text not null default 'checkout_opened',
  to_state text not null,
  evidence_kind text not null default 'canonical_provider_result',
  authority_kind text not null,
  authority_id varchar(160) not null,
  evidence_artifact_id varchar(160) not null,
  evidence_artifact_digest varchar(71) not null,
  intent_version_from numeric(38,0) not null default 1,
  intent_version_to numeric(38,0) not null,
  session_version_from numeric(38,0) not null default 1,
  session_version_to numeric(38,0) not null
  , observed_at timestamptz not null default clock_timestamp()
  , committed_at timestamptz not null default clock_timestamp()
);

create table finance_provider_accounts (
  id uuid not null default gen_random_uuid(),
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  identity_version integer not null,
  provider text not null,
  primary key (series_id, provider_account_id, identity_version)
);

create table finance_provider_semantic_facts (
  id varchar(160) primary key,
  inbox_item_id varchar(160) not null,
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  economic_payment_intent_id varchar(160) not null,
  economic_payment_session_id varchar(160),
  semantic_source_kind text not null,
  semantic_source_id varchar(160) not null,
  provider_payment_id varchar(160),
  amount_minor numeric(38,0),
  currency text,
  purpose text not null,
  canonical_fact_digest varchar(71) not null,
  evidence_artifact_id varchar(160) not null,
  evidence_artifact_digest varchar(71) not null,
  effect_disposition text not null,
  observed_at timestamptz not null,
  committed_at timestamptz not null
);

create table finance_webhook_semantic_commit_receipts (
  id uuid primary key,
  semantic_fact_id varchar(160) not null,
  inbox_item_id varchar(160) not null,
  processing_status text not null,
  effect_disposition text not null,
  semantic_source_kind text not null,
  committed_at timestamptz not null
);

create table finance_provider_operation_intents (
  id varchar(160) primary key,
  economic_payment_intent_id varchar(160) not null,
  correlated_economic_payment_version numeric(38,0) not null,
  economic_payment_session_id varchar(160),
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  purpose text not null,
  source_id varchar(160) not null,
  operation_kind text not null,
  dispatch_step text,
  status text not null,
  version numeric(38,0) not null,
  source_chain_version numeric(38,0) not null default 1,
  predecessor_intent_id varchar(160),
  predecessor_source_chain_version numeric(38,0),
  replacement_authority_digest varchar(71),
  idempotency_key varchar(160) not null default 'test-key',
  idempotency_retention_deadline timestamptz not null default clock_timestamp(),
  canonical_request_digest varchar(71) not null,
  dispatch_authorization_id varchar(160) not null default 'test-authority',
  dispatch_authorization_version numeric(38,0) not null default 1,
  dispatch_authorization_digest varchar(71) not null default 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  operation_policy_id varchar(160) not null default 'capture-test-policy',
  operation_policy_version numeric(38,0) not null default 1,
  operation_policy_digest varchar(71) not null default 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  operation_maximum_rows integer not null default 64,
  operation_maximum_decimal_digits integer not null default 38,
  operation_maximum_artifact_bytes integer not null default 2097152,
  restricted_credential_id varchar(160),
  restricted_credential_version numeric(38,0),
  transient_secret_ref_id varchar(160),
  provider_unknown_observed_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
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
  captured_at timestamptz not null,
  committed_at timestamptz not null default clock_timestamp()
);

create table finance_payment_clearing_heads (
  economic_payment_intent_id varchar(160) primary key,
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  currency text not null,
  state text not null,
  version numeric(38,0) not null
);

create table finance_provider_operation_result_commit_receipts (
  id uuid primary key,
  provider_operation_result_id varchar(160) not null,
  provider_operation_intent_id varchar(160) not null,
  provider_operation_intent_version numeric(38,0) not null,
  economic_payment_intent_id varchar(160) not null,
  correlated_economic_payment_version numeric(38,0) not null,
  economic_payment_session_id varchar(160) not null,
  purpose text not null,
  source_id varchar(200) not null,
  operation_kind text not null,
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  outcome text not null,
  provider_operation_id varchar(160) not null,
  provider_payment_id varchar(160) not null,
  amount_minor numeric(38,0) not null,
  currency text not null,
  canonical_request_digest varchar(71) not null,
  idempotency_key varchar(160) not null default 'test-key',
  evidence_artifact_id varchar(160) not null,
  evidence_artifact_digest varchar(71) not null,
  observed_at timestamptz not null,
  result_committed_at timestamptz not null default clock_timestamp(),
  canonical_preimage text not null default 'provider-result-receipt-preimage',
  canonical_digest varchar(71) not null default 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  persistence_transaction_boundary_ref varchar(200) not null default 'postgres-xid:101',
  committed_at timestamptz not null default clock_timestamp()
);

create table finance_order_economics_snapshots (
  order_id varchar(200) primary key,
  astrologer_user_id uuid not null,
  gross_amount_minor numeric(38,0) not null,
  gross_currency text not null,
  commission_amount_minor numeric(38,0) not null,
  payable_amount_minor numeric(38,0) not null,
  canonical_digest varchar(71) not null,
  unique (order_id, canonical_digest)
);

create table finance_risk_policy_versions (
  policy_id varchar(160) not null,
  policy_version numeric(38,0) not null,
  canonical_digest varchar(71) not null,
  primary key (policy_id, policy_version),
  unique (policy_id, policy_version, canonical_digest)
);

create table finance_paid_product_fulfillment_decisions (
  registry_key varchar(200) not null,
  registry_revision numeric(38,0) not null,
  canonical_digest varchar(71) not null,
  primary key (registry_key, registry_revision),
  unique (registry_key, registry_revision, canonical_digest)
);

create table finance_source_identities (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null,
  source_id varchar(200) not null,
  source_operation_key text not null,
  source_scope_kind text not null,
  provider_account_version_id uuid,
  provider_account_series_id varchar(160),
  provider_account_id varchar(160),
  provider_identity_version integer,
  bank_cash_pool_id varchar(160),
  astrologer_user_id uuid,
  refund_id varchar(160),
  payout_request_id varchar(160),
  created_at timestamptz not null default now()
);

create table finance_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  account_class text not null default '',
  normal_side text not null default '',
  scope_kind text not null,
  provider_account_version_id uuid,
  provider_account_series_id varchar(160),
  provider_account_id varchar(160),
  provider_identity_version integer,
  bank_cash_pool_id varchar(160),
  astrologer_user_id uuid,
  refund_id varchar(160),
  payout_request_id varchar(160),
  currency text not null default 'RUB',
  created_at timestamptz not null default now()
);

create table finance_journal_transactions (
  id varchar(200) primary key,
  source_identity_id uuid not null,
  occurred_at timestamptz not null default now(),
  posted_at timestamptz not null default now(),
  reverses_journal_transaction_id varchar(200),
  currency text not null,
  entry_count integer not null default 0,
  total_debit_minor numeric(38,0) not null default 0,
  total_credit_minor numeric(38,0) not null default 0,
  canonical_preimage text not null default '',
  canonical_digest varchar(71) not null default '',
  sealed_at timestamptz,
  created_at timestamptz not null default now()
);

create table finance_journal_entries (
  id uuid primary key default gen_random_uuid(),
  journal_transaction_id varchar(200) not null,
  entry_index integer not null,
  account_id uuid not null,
  side text not null,
  amount_minor numeric(38,0) not null,
  currency text not null,
  original_sale_id varchar(200),
  component_id varchar(200),
  payable_lot_id varchar(200),
  payout_allocation_id varchar(200)
);

create table finance_allocation_link_proofs (
  id uuid primary key,
  proof_id varchar(200) not null,
  version integer not null,
  proof_digest varchar(71) not null
);

create table finance_persistence_commit_receipts (
  receipt_id varchar(200) primary key,
  journal_transaction_id varchar(200) not null,
  proof_record_id uuid not null,
  canonical_digest varchar(71) not null,
  persistence_transaction_boundary_ref varchar(200) not null
);

create table finance_wallet_commit_bindings (
  commit_receipt_id varchar(200) primary key,
  operation_id varchar(200) not null,
  operation_receipt_id varchar(200) not null,
  next_wallet_id uuid not null,
  next_wallet_revision numeric(38,0) not null,
  commit_receipt_canonical_digest varchar(71) not null,
  persistence_transaction_boundary_ref varchar(200) not null,
  journal_persistence_receipt_id varchar(200) not null,
  journal_transaction_id varchar(200) not null,
  journal_transaction_digest varchar(71) not null,
  journal_link_proof_id varchar(200) not null,
  journal_link_proof_digest varchar(71) not null,
  astrologer_user_id uuid not null
);

create table finance_payable_lots (
  lot_id varchar(200) primary key,
  wallet_id uuid not null,
  astrologer_user_id uuid not null,
  root_lot_id varchar(200) not null,
  parent_lot_id varchar(200),
  lineage_depth integer not null,
  original_sale_id varchar(200) not null,
  amount_minor numeric(38,0) not null,
  currency text not null,
  bucket text not null,
  captured_at timestamptz not null,
  created_at timestamptz not null,
  became_available_at timestamptz,
  created_by_operation_id varchar(200) not null,
  created_by_receipt_id varchar(200) not null,
  created_effect_id varchar(200),
  component_slot_id varchar(200),
  capture_intent_id varchar(160) not null,
  capture_session_id varchar(160) not null,
  provider_account_series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  provider_payment_id varchar(160) not null,
  canonical_capture_evidence_id varchar(160) not null,
  capture_amount_minor numeric(38,0) not null,
  capture_currency text not null,
  capture_evidence_authority_kind text not null,
  capture_evidence_authority_id varchar(160) not null,
  capture_evidence_artifact_id varchar(160) not null,
  capture_evidence_artifact_digest varchar(71) not null,
  economics_snapshot_digest varchar(71) not null,
  risk_policy_id varchar(160) not null,
  risk_policy_version numeric(38,0) not null,
  risk_policy_digest varchar(71) not null,
  fulfillment_decision_id varchar(200) not null,
  fulfillment_decision_version numeric(38,0) not null,
  fulfillment_decision_digest varchar(71) not null,
  payout_request_id varchar(160),
  payout_allocation_id varchar(200),
  refund_id varchar(160)
);

create table platform_tariff_subscriptions (
  id uuid primary key,
  owner_user_id uuid not null,
  tariff_series_id varchar(160) not null,
  tariff_version integer not null,
  tariff_version_digest varchar(71) not null,
  commission_bps_snapshot integer not null,
  billing_cycle text not null,
  state text not null,
  version integer not null,
  starts_at timestamptz,
  ends_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table platform_tariff_invoices (
  id varchar(160) primary key,
  subscription_id uuid not null,
  owner_user_id uuid not null,
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
  voided_at timestamptz
);

create table finance_platform_invoice_payment_bindings (
  invoice_id varchar(160) primary key,
  economic_payment_intent_id varchar(160) not null,
  created_at timestamptz not null default now()
);

create table finance_verified_capture_application_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  receipt_version integer not null default 1,
  economic_payment_intent_id varchar(160) not null default '',
  economic_payment_version numeric(38,0) not null default 0,
  economic_payment_session_id varchar(160) not null default '',
  economic_payment_session_version numeric(38,0) not null default 0,
  purpose text not null default '',
  source_id varchar(200) not null default '',
  economic_effect_kind text not null default '',
  capture_fact_id varchar(160) not null,
  capture_transition_fact_id varchar(160) not null default '',
  capture_evidence_authority_kind text not null default '',
  capture_evidence_authority_id varchar(160) not null default '',
  provider_result_receipt_id uuid,
  provider_semantic_fact_id varchar(160),
  provider_semantic_commit_receipt_id uuid,
  provider_operation_result_id varchar(160),
  provider_operation_intent_id varchar(160),
  provider_operation_intent_version numeric(38,0),
  correlated_economic_payment_version numeric(38,0),
  operation_kind text,
  provider_account_series_id varchar(160) not null default '',
  provider_account_id varchar(160) not null default '',
  provider_identity_version integer not null default 0,
  provider_operation_outcome text,
  provider_operation_id varchar(160),
  provider_payment_id varchar(160) not null default '',
  amount_minor numeric(38,0) not null default 0,
  currency text not null default '',
  canonical_request_digest varchar(71) not null default '',
  evidence_artifact_id varchar(160) not null default '',
  evidence_artifact_digest varchar(71) not null default '',
  provider_observed_at timestamptz not null default now(),
  astrologer_user_id uuid,
  order_economics_digest varchar(71),
  root_payable_lot_id varchar(200),
  risk_policy_id varchar(160),
  risk_policy_version numeric(38,0),
  risk_policy_digest varchar(71),
  fulfillment_decision_id varchar(200),
  fulfillment_decision_version numeric(38,0),
  fulfillment_decision_digest varchar(71),
  clearing_state text,
  clearing_version numeric(38,0),
  journal_persistence_receipt_id varchar(200),
  journal_transaction_id varchar(200),
  journal_transaction_digest varchar(71),
  journal_commit_digest varchar(71),
  journal_link_proof_id varchar(200),
  journal_link_proof_version integer,
  journal_link_proof_digest varchar(71),
  wallet_commit_receipt_id varchar(200),
  wallet_operation_id varchar(200),
  wallet_id uuid,
  wallet_revision numeric(38,0),
  wallet_commit_digest varchar(71),
  outbox_event_id uuid not null default gen_random_uuid(),
  persistence_transaction_boundary_ref varchar(200) not null default '',
  canonical_preimage text not null default '',
  canonical_digest varchar(71) not null default '',
  committed_at timestamptz not null default now()
);
`;
