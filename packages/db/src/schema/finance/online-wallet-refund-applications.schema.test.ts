import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { financeOnlineWalletRefundApplications } from "./online-wallet-refund-applications.schema";

describe("online wallet refund application schema", () => {
  it("binds one canonical provider refund fact to the exact V2 wallet mutation", () => {
    expect(getTableName(financeOnlineWalletRefundApplications)).toBe(
      "finance_online_wallet_refund_applications"
    );
    expect(Object.keys(getTableColumns(financeOnlineWalletRefundApplications))).toEqual(
      expect.arrayContaining([
        "id",
        "semanticCommitReceiptId",
        "semanticFactId",
        "providerRefundId",
        "providerPaymentId",
        "captureApplicationId",
        "rootLotId",
        "walletId",
        "walletRevision",
        "outcome",
        "walletMutationId",
        "journalTransactionId",
        "previousRefundedMinor",
        "cumulativeRefundedMinor",
        "refundDeltaMinor",
        "commissionReversalMinor",
        "payableReversalMinor",
        "blockedPayoutOutcomeMinor",
        "canonicalDigest",
        "persistenceTransactionBoundaryRef"
      ])
    );

    const config = getTableConfig(financeOnlineWalletRefundApplications);
    expect(config.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "finance_online_wallet_refund_applications_semantic_receipt_fk",
        "finance_online_wallet_refund_applications_semantic_fact_fk",
        "finance_online_wallet_refund_applications_capture_application_fk",
        "finance_online_wallet_refund_applications_root_lot_fk",
        "finance_online_wallet_refund_applications_wallet_mutation_fk",
        "finance_online_wallet_refund_applications_journal_fk"
      ])
    );
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "finance_online_wallet_refund_applications_semantic_receipt_unique",
        "finance_online_wallet_refund_applications_provider_refund_unique",
        "finance_online_wallet_refund_applications_wallet_history_idx",
        "finance_online_wallet_refund_applications_boundary_unique"
      ])
    );
  });
});
