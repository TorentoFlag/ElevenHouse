import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeOnlineWalletRefundCaseAllocations,
  financeOnlineWalletRefundCases,
  financeOnlineWalletRefundCaseTransitions
} from "./online-wallet-refund-cases.schema";

describe("online wallet refund case schema", () => {
  it("keeps approval, exact pending allocations and terminal history in the V2 graph", () => {
    expect(getTableName(financeOnlineWalletRefundCases)).toBe("finance_online_wallet_refund_cases");
    expect(Object.keys(getTableColumns(financeOnlineWalletRefundCases))).toEqual(
      expect.arrayContaining([
        "refundCaseId",
        "refundCandidateId",
        "approvalWalletMutationId",
        "providerOperationIntentId",
        "approvedCumulativeRefundedMinor",
        "terminalApplicationId"
      ])
    );
    expect(getTableConfig(financeOnlineWalletRefundCaseAllocations).foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "finance_online_wallet_refund_case_allocations_case_fk",
        "finance_online_wallet_refund_case_allocations_pending_allocation_fk"
      ])
    );
    expect(Object.keys(getTableColumns(financeOnlineWalletRefundCaseTransitions))).toEqual(
      expect.arrayContaining(["refundCaseId", "version", "status", "authorityDigest"])
    );
  });
});
