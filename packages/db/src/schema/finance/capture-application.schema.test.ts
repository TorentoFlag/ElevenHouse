import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeVerifiedCaptureApplicationIntegritySql,
  financeVerifiedCaptureApplicationReceipts
} from "./capture-application.schema";

describe("verified capture cross-contour receipt schema", () => {
  it("owns one exact economic/provider/wallet commit tuple and IDs-only outbox link", () => {
    expect(getTableName(financeVerifiedCaptureApplicationReceipts)).toBe(
      "finance_verified_capture_application_receipts"
    );
    expect(Object.keys(getTableColumns(financeVerifiedCaptureApplicationReceipts))).toEqual(
      expect.arrayContaining([
        "receiptId",
        "receiptVersion",
        "economicPaymentIntentId",
        "economicPaymentVersion",
        "economicPaymentSessionId",
        "economicPaymentSessionVersion",
        "purpose",
        "sourceId",
        "economicEffectKind",
        "captureFactId",
        "captureTransitionFactId",
        "captureEvidenceAuthorityKind",
        "captureEvidenceAuthorityId",
        "providerResultReceiptId",
        "providerSemanticFactId",
        "providerSemanticCommitReceiptId",
        "providerOperationResultId",
        "providerOperationIntentId",
        "providerOperationIntentVersion",
        "correlatedEconomicPaymentVersion",
        "operationKind",
        "providerAccountSeriesId",
        "providerAccountId",
        "providerIdentityVersion",
        "providerOperationOutcome",
        "providerOperationId",
        "providerPaymentId",
        "amountMinor",
        "currency",
        "canonicalRequestDigest",
        "evidenceArtifactId",
        "evidenceArtifactDigest",
        "providerObservedAt",
        "astrologerUserId",
        "orderEconomicsDigest",
        "rootPayableLotId",
        "riskPolicyId",
        "riskPolicyVersion",
        "riskPolicyDigest",
        "fulfillmentDecisionId",
        "fulfillmentDecisionVersion",
        "fulfillmentDecisionDigest",
        "clearingState",
        "clearingVersion",
        "journalPersistenceReceiptId",
        "journalTransactionId",
        "journalTransactionDigest",
        "journalCommitDigest",
        "journalLinkProofId",
        "journalLinkProofVersion",
        "journalLinkProofDigest",
        "walletCommitReceiptId",
        "walletOperationId",
        "walletId",
        "walletRevision",
        "walletCommitDigest",
        "outboxEventId",
        "persistenceTransactionBoundaryRef",
        "canonicalPreimage",
        "canonicalDigest",
        "committedAt"
      ])
    );

    const config = getTableConfig(financeVerifiedCaptureApplicationReceipts);
    expect(config.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "finance_verified_capture_receipts_capture_fact_fk",
        "finance_verified_capture_receipts_transition_fact_fk",
        "finance_verified_capture_receipts_provider_result_fk",
        "finance_verified_capture_receipts_provider_semantic_fact_fk",
        "finance_verified_capture_receipts_provider_semantic_commit_fk",
        "finance_verified_capture_receipts_economics_fk",
        "finance_verified_capture_receipts_root_lot_fk",
        "finance_verified_capture_receipts_risk_policy_fk",
        "finance_verified_capture_receipts_fulfillment_fk",
        "finance_verified_capture_receipts_journal_commit_fk",
        "finance_verified_capture_receipts_wallet_commit_fk",
        "finance_verified_capture_receipts_outbox_fk"
      ])
    );
    expect(config.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "finance_verified_capture_receipts_effect_shape_check",
        "finance_verified_capture_receipts_digest_boundary_check"
      ])
    );
    const publicOwner = config.uniqueConstraints.find(
      (constraint) => constraint.name === "finance_verified_capture_receipts_exact_owner_unique"
    );
    expect(publicOwner?.columns.map((column) => column.name)).toEqual([
      "receipt_id",
      "receipt_version",
      "canonical_digest"
    ]);
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "finance_verified_capture_receipts_capture_unique",
        "finance_verified_capture_receipts_provider_result_unique",
        "finance_verified_capture_receipts_provider_semantic_commit_unique",
        "finance_verified_capture_receipts_wallet_commit_unique",
        "finance_verified_capture_receipts_boundary_unique",
        "finance_verified_capture_receipts_digest_unique"
      ])
    );
  });

  it("defers exact outbox/economic head verification and makes receipts immutable", () => {
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain(
      "new.receipt_id := gen_random_uuid()"
    );
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain(
      "new.outbox_event_id := gen_random_uuid()"
    );
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain("insert into outbox_events");
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain("finance_canonical_jsonb_v1");
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain(
      "verified capture application receipts are immutable"
    );
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain(
      "capture application receipt requires the exact IDs-only outbox event"
    );
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain(
      "capture application receipt requires the exact committed economic head"
    );
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain(
      "client capture financial path must match the immutable order economics"
    );
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain(
      "capture application journal must share the persistence transaction boundary"
    );
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain(
      "capture application effects must share the current PostgreSQL transaction"
    );
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain(
      "capture fact requires its DB-issued verified application receipt"
    );
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain(
      "capture application journal does not match its exact economic posting"
    );
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain(
      "capture application wallet commit requires exactly one exact persisted root lot"
    );
    expect(financeVerifiedCaptureApplicationIntegritySql).toContain(
      "deferrable initially deferred"
    );
  });

  it("uses semantic capture authority for client HPP and provider results only for platform flows", () => {
    const normalized = financeVerifiedCaptureApplicationIntegritySql.replace(/\s+/gu, " ");
    expect(normalized).toContain("intent_row.purpose = 'client_order'");
    expect(normalized).toContain("capture_row.evidence_authority_kind <> 'provider_semantic_fact'");
    expect(normalized).toContain("semantic_receipt.effect_disposition <> 'applied_once'");
    expect(normalized).toContain("semantic_receipt.processing_status <> 'completed'");
    expect(normalized).toContain(
      "intent_row.purpose = 'platform_invoice' and result_receipt.operation_kind = 'saved_card_charge'"
    );
    expect(normalized).toContain(
      "intent_row.purpose = 'platform_card_setup' and result_receipt.operation_kind = 'card_setup'"
    );
    expect(normalized).toContain("new.provider_semantic_fact_id := null");
    expect(normalized).toContain("new.provider_result_receipt_id := null");
  });
});
