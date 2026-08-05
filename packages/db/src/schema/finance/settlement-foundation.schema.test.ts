import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeMerchantPayoutConfirmationCommitReceipts,
  financeSettlementBatchIngestionCommitReceipts,
  financeSettlementCursors,
  financeSettlementIntegritySql,
  financeSettlementLedgerEntries,
  financeSettlementLedgerPageEntries,
  financeSettlementPaymentMatchCommitReceipts,
  financeSettlementPageCheckpoints,
  financeSettlementPages,
  financeSettlementPayoutPageEntries,
  financeSettlementPayouts
} from "./settlement.schema";

function config(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table);
}

function names(items: ReadonlyArray<{ name?: string; config?: { name?: string } }>): string[] {
  return items.flatMap((item) => {
    const name = item.name ?? item.config?.name;
    return name === undefined ? [] : [name];
  });
}

function foreignKeyNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return config(table).foreignKeys.map((key) => key.getName());
}

describe("restart-safe ArcPay settlement persistence foundation", () => {
  it("owns one cursor per exact provider identity and stream with DB-clock lease fencing", () => {
    expect(getTableName(financeSettlementCursors)).toBe("finance_settlement_cursors");
    expect(Object.keys(getTableColumns(financeSettlementCursors))).toEqual(
      expect.arrayContaining([
        "providerAccountSeriesId",
        "providerAccountId",
        "providerIdentityVersion",
        "stream",
        "fencingToken",
        "version",
        "leaseOwnerId",
        "leaseTokenDigest",
        "leaseClaimedAt",
        "leaseExpiresAt",
        "windowGeneration",
        "activeWindowStart",
        "activeWindowEnd",
        "nextPageCursor"
      ])
    );
    expect(names(config(financeSettlementCursors).uniqueConstraints)).toContain(
      "finance_settlement_cursors_provider_stream_unique"
    );
    expect(foreignKeyNames(financeSettlementCursors)).toContain(
      "finance_settlement_cursors_provider_identity_fk"
    );
    expect(financeSettlementIntegritySql).toContain("clock_timestamp()");
    expect(financeSettlementIntegritySql).toContain("lease_token_digest");
    expect(financeSettlementIntegritySql).toContain("finance_settlement_cursors_no_truncate");
    expect(financeSettlementIntegritySql).not.toContain("lease_token =");
  });

  it("makes nullable first-page cursors canonical and rejects first-page replay or A-B-A cycles", () => {
    expect(getTableName(financeSettlementPages)).toBe("finance_settlement_pages");
    expect(getTableName(financeSettlementPageCheckpoints)).toBe(
      "finance_settlement_page_checkpoints"
    );
    expect(Object.keys(getTableColumns(financeSettlementPageCheckpoints))).toEqual(
      expect.arrayContaining([
        "settlementCursorId",
        "windowGeneration",
        "checkpointIdentity",
        "providerPageCursor",
        "nextPageCursor",
        "settlementPageId",
        "fencingToken",
        "cursorVersionBefore",
        "cursorVersionAfter"
      ])
    );
    expect(names(config(financeSettlementPageCheckpoints).uniqueConstraints)).toContain(
      "finance_settlement_page_checkpoints_identity_unique"
    );
    expect(names(config(financeSettlementPages).uniqueConstraints)).toContain(
      "finance_settlement_pages_checkpoint_unique"
    );
    expect(financeSettlementIntegritySql).toContain("provider_page_cursor is null");
    expect(financeSettlementIntegritySql).toContain("checkpoint_identity");
  });

  it("stores ledger entries and merchant payout history in structurally separate streams", () => {
    expect(getTableName(financeSettlementLedgerEntries)).toBe("finance_settlement_ledger_entries");
    expect(getTableName(financeSettlementPayouts)).toBe("finance_settlement_payouts");
    expect(getTableName(financeSettlementLedgerPageEntries)).toBe(
      "finance_settlement_ledger_page_entries"
    );
    expect(getTableName(financeSettlementPayoutPageEntries)).toBe(
      "finance_settlement_payout_page_entries"
    );

    const ledgerColumns = Object.keys(getTableColumns(financeSettlementLedgerEntries));
    const payoutColumns = Object.keys(getTableColumns(financeSettlementPayouts));
    expect(ledgerColumns).toEqual(
      expect.arrayContaining([
        "providerEntryId",
        "amountMinor",
        "feeAmountMinor",
        "balanceAfterMinor",
        "bankRrn",
        "bankAuthCode",
        "bankInternalReference",
        "settlementStatus",
        "rawPayloadDigest"
      ])
    );
    expect(ledgerColumns).not.toContain("payoutStatus");
    expect(payoutColumns).toEqual(
      expect.arrayContaining([
        "merchantPayoutId",
        "status",
        "providerBankPayoutId",
        "bankPayoutStatus",
        "failedReason",
        "rawPayloadDigest"
      ])
    );
    expect(payoutColumns).not.toContain("payoutRequestId");

    expect(names(config(financeSettlementLedgerEntries).uniqueConstraints)).toContain(
      "finance_settlement_ledger_entries_provider_entry_unique"
    );
    expect(names(config(financeSettlementPayouts).uniqueConstraints)).toContain(
      "finance_settlement_payouts_provider_payout_unique"
    );
    expect(names(config(financeSettlementLedgerPageEntries).checks)).toContain(
      "finance_settlement_ledger_page_entries_stream_check"
    );
    expect(names(config(financeSettlementPayoutPageEntries).checks)).toContain(
      "finance_settlement_payout_page_entries_stream_check"
    );
    expect(financeSettlementIntegritySql).toContain(
      "finance_settlement_ledger_page_entries_no_truncate"
    );
    expect(financeSettlementIntegritySql).toContain(
      "finance_settlement_payout_page_entries_no_truncate"
    );
  });

  it("binds every page to an exact sealed provider artifact without storing raw payload", () => {
    expect(Object.keys(getTableColumns(financeSettlementPages))).toEqual(
      expect.arrayContaining([
        "rawArtifactId",
        "rawArtifactDigest",
        "rawArtifactByteLength",
        "decodedEntriesDigest",
        "returnedCount"
      ])
    );
    expect(foreignKeyNames(financeSettlementPages)).toContain(
      "finance_settlement_pages_raw_artifact_fk"
    );
    expect(financeSettlementIntegritySql).toContain("provider_settlement_page");
    expect(financeSettlementIntegritySql).toContain("raw_artifact_digest");

    const normalizedColumns = [
      ...Object.keys(getTableColumns(financeSettlementPages)),
      ...Object.keys(getTableColumns(financeSettlementLedgerEntries)),
      ...Object.keys(getTableColumns(financeSettlementPayouts))
    ]
      .map((column) => column.toLowerCase())
      .filter((column) => column !== "rawpayloaddigest");
    expect(
      normalizedColumns.some((column) =>
        /rawbody|raw_body|rawpayload|raw_payload|plaintext|ciphertext|objectkey|signedurl/.test(
          column
        )
      )
    ).toBe(false);
  });

  it("issues an immutable ingestion receipt from the same page/checkpoint/cursor boundary", () => {
    expect(getTableName(financeSettlementBatchIngestionCommitReceipts)).toBe(
      "finance_settlement_batch_ingestion_commit_receipts"
    );
    expect(Object.keys(getTableColumns(financeSettlementBatchIngestionCommitReceipts))).toEqual(
      expect.arrayContaining([
        "receiptId",
        "receiptVersion",
        "canonicalDigest",
        "settlementPageId",
        "settlementCheckpointId",
        "settlementCursorId",
        "rawArtifactId",
        "rawArtifactDigest",
        "decodedEntriesDigest",
        "insertedEntryCount",
        "replayedEntryCount",
        "cursorVersion",
        "fencingToken",
        "persistenceTransactionBoundaryRef",
        "databaseCommittedAt"
      ])
    );
    expect(names(config(financeSettlementBatchIngestionCommitReceipts).uniqueConstraints)).toEqual(
      expect.arrayContaining([
        "finance_settlement_batch_ingestion_receipts_nominal_ref_unique",
        "finance_settlement_batch_ingestion_receipts_page_unique",
        "finance_settlement_batch_ingestion_receipts_boundary_unique"
      ])
    );
    expect(financeSettlementIntegritySql).not.toContain(
      "coalesce(nullif(new.receipt_id, ''), gen_random_uuid()::text)"
    );
    expect(financeSettlementIntegritySql).not.toContain("new.canonical_preimage := concat_ws('|'");
  });

  it("owns an exact immutable settlement-payment match authority without money mutation", () => {
    expect(getTableName(financeSettlementPaymentMatchCommitReceipts)).toBe(
      "finance_settlement_payment_match_commit_receipts"
    );
    const columns = Object.keys(getTableColumns(financeSettlementPaymentMatchCommitReceipts));
    expect(columns).toEqual(
      expect.arrayContaining([
        "receiptId",
        "receiptVersion",
        "canonicalPreimage",
        "canonicalDigest",
        "batchIngestionReceiptId",
        "batchIngestionReceiptVersion",
        "batchIngestionReceiptDigest",
        "settlementPageId",
        "settlementEntryId",
        "providerAccountSeriesId",
        "providerAccountId",
        "providerIdentityVersion",
        "providerEntryId",
        "economicPaymentIntentId",
        "captureFactId",
        "providerPaymentId",
        "amountMinor",
        "currency",
        "matchResult",
        "correlationRuleId",
        "correlationRuleVersion",
        "correlationRuleDigest",
        "ruleReferenceType",
        "ruleDirection",
        "ruleEntryType",
        "ruleSettlementStatus",
        "ruleAmountRelation",
        "clearingVersion",
        "matchEvidenceDigest",
        "settlementExceptionId",
        "operationPolicyId",
        "operationPolicyVersion",
        "operationPolicyDigest",
        "maximumRows",
        "maximumDecimalDigits",
        "maximumArtifactBytes",
        "persistenceTransactionBoundaryRef",
        "committedAt"
      ])
    );
    for (const forbidden of [
      "journalTransactionId",
      "walletId",
      "bankCashPoolId",
      "bankCashAmountMinor"
    ]) {
      expect(columns).not.toContain(forbidden);
    }
    expect(foreignKeyNames(financeSettlementPaymentMatchCommitReceipts)).toEqual(
      expect.arrayContaining([
        "finance_settlement_payment_match_receipts_batch_fk",
        "finance_settlement_payment_match_receipts_entry_fk",
        "finance_settlement_payment_match_receipts_intent_fk",
        "finance_settlement_payment_match_receipts_capture_fk",
        "finance_settlement_payment_match_receipts_clearing_fk",
        "finance_settlement_payment_match_receipts_exception_fk"
      ])
    );
    expect(names(config(financeSettlementPaymentMatchCommitReceipts).uniqueConstraints)).toEqual(
      expect.arrayContaining([
        "finance_settlement_payment_match_receipts_nominal_ref_unique",
        "finance_settlement_payment_match_receipts_exact_authority_unique",
        "finance_settlement_payment_match_receipts_provider_entry_unique",
        "finance_settlement_payment_match_receipts_boundary_unique"
      ])
    );
    expect(names(config(financeSettlementPaymentMatchCommitReceipts).indexes)).toContain(
      "finance_settlement_payment_match_receipts_matched_capture_unique"
    );
    expect(financeSettlementIntegritySql).toContain(
      "finance_issue_settlement_payment_match_receipt"
    );
    expect(financeSettlementIntegritySql).toContain(
      "finance_settlement_payment_match_receipts_immutable"
    );
    expect(financeSettlementIntegritySql).toContain("quarantined_no_effect");
  });

  it("exposes the immutable exact merchant-payout authority tuple required by bank matching", () => {
    expect(getTableName(financeMerchantPayoutConfirmationCommitReceipts)).toBe(
      "finance_merchant_payout_confirmation_commit_receipts"
    );
    expect(Object.keys(getTableColumns(financeMerchantPayoutConfirmationCommitReceipts))).toEqual(
      expect.arrayContaining([
        "receiptId",
        "receiptVersion",
        "canonicalDigest",
        "providerAccountSeriesId",
        "providerAccountId",
        "providerIdentityVersion",
        "merchantPayoutId",
        "providerBankPayoutId",
        "bankCashPoolId",
        "amountMinor",
        "currency",
        "bankReference",
        "journalTransactionId"
      ])
    );
    expect(
      names(config(financeMerchantPayoutConfirmationCommitReceipts).uniqueConstraints)
    ).toEqual(
      expect.arrayContaining([
        "finance_merchant_payout_confirmation_receipts_nominal_ref_unique",
        "finance_merchant_payout_confirmation_receipts_bank_authority_unique"
      ])
    );
    expect(financeSettlementIntegritySql).toContain(
      "finance_merchant_payout_confirmation_commit_receipts"
    );
    expect(financeSettlementIntegritySql).toContain("bank_cash");
    expect(financeSettlementIntegritySql).toContain("cannot post bank cash");
    expect(
      financeSettlementIntegritySql.match(/new\.receipt_id := gen_random_uuid\(\)::text/g)?.length
    ).toBeGreaterThanOrEqual(3);
  });
});
