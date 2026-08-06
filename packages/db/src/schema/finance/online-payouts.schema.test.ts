import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeOnlinePayoutRequestAllocations,
  financeOnlinePayoutRequests,
  financeOnlinePayoutStateTransitions
} from "./online-payouts.schema";

describe("online payout schema", () => {
  it("keeps new manual-payout authority attached to v2 wallet positions", () => {
    expect(getTableName(financeOnlinePayoutRequests)).toBe("finance_online_payout_requests");
    expect(Object.keys(getTableColumns(financeOnlinePayoutRequests))).toEqual(
      expect.arrayContaining([
        "id",
        "authorizationAggregateId",
        "walletId",
        "walletMutationId",
        "astrologerUserId",
        "immutableAmountMinor",
        "status",
        "version",
        "payoutMethodId",
        "payoutMethodVersion",
        "beneficiaryFingerprint"
      ])
    );
    expect(getTableConfig(financeOnlinePayoutRequests).uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "finance_online_payout_requests_authorization_aggregate_unique"
    );
    expect(getTableName(financeOnlinePayoutRequestAllocations)).toBe(
      "finance_online_payout_request_allocations"
    );
    expect(Object.keys(getTableColumns(financeOnlinePayoutRequestAllocations))).toEqual(
      expect.arrayContaining([
        "payoutRequestId",
        "sourceAllocationId",
        "payoutPendingAllocationId",
        "rootLotId",
        "amountMinor"
      ])
    );
    expect(getTableName(financeOnlinePayoutStateTransitions)).toBe(
      "finance_online_payout_state_transitions"
    );
    expect(
      getTableConfig(financeOnlinePayoutStateTransitions).uniqueConstraints.map(
        (constraint) => constraint.name
      )
    ).toContain("finance_online_payout_state_transitions_request_version_unique");
  });
});
