import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeOnlinePayableSourceAllocations,
  financeOnlinePayableSourceConsumptions,
  financeOnlineWalletHoldReleaseEvidence,
  financeOnlineWalletMutations
} from "./online-wallet-mutations.schema";

describe("online wallet mutation schema", () => {
  it("keeps each new v2 allocation and wallet mutation in the online ledger", () => {
    expect(getTableName(financeOnlinePayableSourceAllocations)).toBe(
      "finance_online_payable_source_allocations"
    );
    expect(Object.keys(getTableColumns(financeOnlinePayableSourceAllocations))).toEqual(
      expect.arrayContaining([
        "allocationId",
        "rootLotId",
        "walletId",
        "amountMinor",
        "bucket",
        "returnBucket",
        "sourceConsumptionId"
      ])
    );
    expect(getTableName(financeOnlinePayableSourceConsumptions)).toBe(
      "finance_online_payable_source_consumptions"
    );
    expect(Object.keys(getTableColumns(financeOnlinePayableSourceConsumptions))).toEqual(
      expect.arrayContaining([
        "consumptionId",
        "mutationId",
        "rootLotId",
        "sourceKind",
        "sourceAllocationId",
        "disposedMinor",
        "dispositionKind"
      ])
    );
    expect(getTableName(financeOnlineWalletMutations)).toBe("finance_online_wallet_mutations");
    expect(Object.keys(getTableColumns(financeOnlineWalletMutations))).toEqual(
      expect.arrayContaining([
        "mutationId",
        "walletId",
        "expectedWalletRevision",
        "nextWalletRevision",
        "previousCommitmentDigest",
        "commitmentDigest",
        "journalTransactionId"
      ])
    );
    expect(
      getTableConfig(financeOnlineWalletMutations).uniqueConstraints.map((constraint) =>
        constraint.name
      )
    ).toContain("finance_online_wallet_mutations_journal_unique");

    expect(getTableName(financeOnlineWalletHoldReleaseEvidence)).toBe(
      "finance_online_wallet_hold_release_evidence"
    );
    expect(Object.keys(getTableColumns(financeOnlineWalletHoldReleaseEvidence))).toEqual(
      expect.arrayContaining([
        "mutationId",
        "rootLotId",
        "orderId",
        "bookingId",
        "bookingLifecycleEventId",
        "completedAt",
        "bookingCompletionDigest",
        "merchantPayoutInclusionReceiptId"
      ])
    );
  });
});
