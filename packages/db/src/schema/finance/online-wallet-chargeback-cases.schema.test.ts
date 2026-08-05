import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { financeOnlineWalletChargebackCases } from "./online-wallet-chargeback-cases.schema";

describe("online wallet chargeback case schema", () => {
  it("keeps the provisional provider loss, exact capture and payout gate in one immutable V2 case", () => {
    expect(getTableName(financeOnlineWalletChargebackCases)).toBe(
      "finance_online_wallet_chargeback_cases"
    );
    expect(Object.keys(getTableColumns(financeOnlineWalletChargebackCases))).toEqual(
      expect.arrayContaining([
        "semanticCommitReceiptId",
        "semanticFactId",
        "chargebackCaseId",
        "providerSourceKind",
        "providerSourceId",
        "captureApplicationId",
        "rootLotId",
        "walletId",
        "orderId",
        "astrologerUserId",
        "status",
        "disputedPrincipalMinor",
        "journalTransactionId",
        "canonicalDigest"
      ])
    );
    const config = getTableConfig(financeOnlineWalletChargebackCases);
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "finance_online_wallet_chargeback_cases_semantic_receipt_unique",
        "finance_online_wallet_chargeback_cases_case_unique",
        "finance_online_wallet_chargeback_cases_provider_source_unique",
        "finance_online_wallet_chargeback_cases_wallet_active_idx"
      ])
    );
  });
});
