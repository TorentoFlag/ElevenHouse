import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeMerchantPayoutPaymentInclusions,
  financeMerchantPayoutStatementIntegritySql,
  financeMerchantPayoutStatementReceipts
} from "./merchant-payout-statements.schema";

describe("ArcPay merchant payout statement authority schema", () => {
  it("separates the sealed aggregate statement from immutable payment inclusions", () => {
    expect(getTableName(financeMerchantPayoutStatementReceipts)).toBe(
      "finance_merchant_payout_statement_receipts"
    );
    expect(getTableName(financeMerchantPayoutPaymentInclusions)).toBe(
      "finance_merchant_payout_payment_inclusions"
    );
    expect(Object.keys(getTableColumns(financeMerchantPayoutStatementReceipts))).toEqual(
      expect.arrayContaining([
        "receiptId",
        "receiptVersion",
        "canonicalDigest",
        "batchIngestionReceiptId",
        "batchIngestionReceiptVersion",
        "batchIngestionReceiptDigest",
        "settlementPageId",
        "settlementPayoutId",
        "providerAccountSeriesId",
        "providerAccountId",
        "providerIdentityVersion",
        "merchantPayoutId",
        "providerBankPayoutId",
        "bankReference",
        "reportedNetPayoutMinor",
        "currency",
        "payoutEvidenceArtifactId",
        "payoutEvidenceArtifactDigest",
        "payoutEvidenceArtifactByteLength",
        "payoutCompletedAt",
        "payoutObservedAt",
        "statementArtifactId",
        "statementArtifactDigest",
        "statementArtifactByteLength",
        "decoderProfileId",
        "decoderProfileVersion",
        "decoderProfileDigest",
        "decodedPaymentLinesDigest",
        "includedPaymentCount",
        "statementObservedAt",
        "operationPolicyId",
        "operationPolicyVersion",
        "operationPolicyDigest",
        "maximumRows",
        "maximumDecimalDigits",
        "maximumArtifactBytes",
        "persistenceTransactionBoundaryRef"
      ])
    );
    expect(Object.keys(getTableColumns(financeMerchantPayoutPaymentInclusions))).toEqual(
      expect.arrayContaining([
        "receiptId",
        "receiptVersion",
        "canonicalDigest",
        "statementReceiptId",
        "statementReceiptVersion",
        "statementReceiptDigest",
        "providerAccountSeriesId",
        "providerAccountId",
        "providerIdentityVersion",
        "merchantPayoutId",
        "economicPaymentIntentId",
        "captureFactId",
        "providerPaymentId",
        "externalId",
        "lineNumber",
        "amountMinor",
        "feeAmountMinor",
        "currency",
        "lineDigest",
        "persistenceTransactionBoundaryRef"
      ])
    );
    for (const table of [
      financeMerchantPayoutStatementReceipts,
      financeMerchantPayoutPaymentInclusions
    ]) {
      expect(Object.keys(getTableColumns(table))).not.toEqual(
        expect.arrayContaining([
          "bankCashPoolId",
          "journalTransactionId",
          "ledgerTransactionId",
          "walletId"
        ])
      );
    }
  });

  it("declares exact nominal, aggregate, capture and line identities", () => {
    const statement = getTableConfig(financeMerchantPayoutStatementReceipts);
    const inclusion = getTableConfig(financeMerchantPayoutPaymentInclusions);

    expect(statement.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "finance_merchant_payout_statement_receipts_batch_fk",
        "finance_merchant_payout_statement_receipts_page_payout_fk",
        "finance_merchant_payout_statement_receipts_payout_fk",
        "finance_merchant_payout_statement_receipts_payout_artifact_fk",
        "finance_merchant_payout_statement_receipts_statement_artifact_fk"
      ])
    );
    expect(inclusion.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "finance_merchant_payout_payment_inclusions_statement_fk",
        "finance_merchant_payout_payment_inclusions_intent_fk",
        "finance_merchant_payout_payment_inclusions_capture_fk"
      ])
    );
    expect(statement.uniqueConstraints.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "finance_merchant_payout_statement_receipts_nominal_ref_unique",
        "finance_merchant_payout_statement_receipts_payout_unique",
        "finance_merchant_payout_statement_receipts_artifact_unique",
        "finance_merchant_payout_statement_receipts_boundary_unique"
      ])
    );
    expect(inclusion.uniqueConstraints.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "finance_merchant_payout_payment_inclusions_nominal_ref_unique",
        "finance_merchant_payout_payment_inclusions_statement_line_unique",
        "finance_merchant_payout_payment_inclusions_exact_authority_unique",
        "finance_merchant_payout_payment_inclusions_capture_unique"
      ])
    );
    expect(statement.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "finance_merchant_payout_statement_receipts_shape_check",
        "finance_merchant_payout_statement_receipts_budget_check"
      ])
    );
    expect(inclusion.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "finance_merchant_payout_payment_inclusions_shape_check",
        "finance_merchant_payout_payment_inclusions_signed_fee_check"
      ])
    );
  });

  it("makes the database issue and revalidate every payout-statement authority", () => {
    expect(financeMerchantPayoutStatementIntegritySql).toContain(
      "artifact.artifact_class <> 'provider_payout_statement'"
    );
    expect(financeMerchantPayoutStatementIntegritySql).toContain(
      "new.receipt_id := gen_random_uuid()::text"
    );
    expect(financeMerchantPayoutStatementIntegritySql).not.toContain(
      "coalesce(nullif(new.receipt_id"
    );
    expect(financeMerchantPayoutStatementIntegritySql).toContain(
      "finance_canonical_jsonb_v1"
    );
    expect(financeMerchantPayoutStatementIntegritySql).toContain(
      "'postgres-xid:' || pg_current_xact_id()::text"
    );
    expect(financeMerchantPayoutStatementIntegritySql).toContain(
      "economic_intent.source_id <> new.external_id"
    );
    expect(financeMerchantPayoutStatementIntegritySql).toContain(
      "capture_fact.provider_payment_id <> new.provider_payment_id"
    );
    expect(financeMerchantPayoutStatementIntegritySql).toContain(
      "statement.decoded_payment_lines_digest <> expected_lines_digest"
    );
    expect(financeMerchantPayoutStatementIntegritySql).toContain(
      "statement.included_payment_count <> included_count"
    );
    expect(financeMerchantPayoutStatementIntegritySql).not.toContain(
      "sum(amount_minor"
    );
    expect(financeMerchantPayoutStatementIntegritySql).toContain(
      "create constraint trigger finance_validate_merchant_payout_statement_complete"
    );
    expect(financeMerchantPayoutStatementIntegritySql).toContain(
      "deferrable initially deferred"
    );
    for (const tableName of [
      "finance_merchant_payout_statement_receipts",
      "finance_merchant_payout_payment_inclusions"
    ]) {
      expect(financeMerchantPayoutStatementIntegritySql).toContain(
        `before update or delete on ${tableName}`
      );
      expect(financeMerchantPayoutStatementIntegritySql).toContain(
        `before truncate on ${tableName}`
      );
    }
  });
});
