import { describe, expect, it } from "vitest";

import {
  OnlineWalletPayoutLifecycleError,
  createOnlineWalletPayoutStateTransitionPlan
} from "./online-wallet-payout-lifecycle";

describe("online wallet payout lifecycle", () => {
  it("requires the maker-checker manual payout sequence", () => {
    expect(
      createOnlineWalletPayoutStateTransitionPlan({
        payoutRequestId: "payout-1",
        previousStatus: "requested",
        expectedVersion: "1",
        nextStatus: "under_review"
      })
    ).toEqual({
      payoutRequestId: "payout-1",
      previousStatus: "requested",
      nextStatus: "under_review",
      expectedVersion: "1",
      nextVersion: "2",
      transitionKind: "under_review"
    });
    expect(
      createOnlineWalletPayoutStateTransitionPlan({
        payoutRequestId: "payout-1",
        previousStatus: "under_review",
        expectedVersion: "2",
        nextStatus: "approved"
      }).nextVersion
    ).toBe("3");
    expect(
      createOnlineWalletPayoutStateTransitionPlan({
        payoutRequestId: "payout-1",
        previousStatus: "approved",
        expectedVersion: "3",
        nextStatus: "processing_manual"
      }).nextVersion
    ).toBe("4");
    expect(
      createOnlineWalletPayoutStateTransitionPlan({
        payoutRequestId: "payout-1",
        previousStatus: "processing_manual",
        expectedVersion: "4",
        nextStatus: "paid"
      }).nextVersion
    ).toBe("5");
  });

  it("rejects skipped, terminal and semantically wrong transitions", () => {
    for (const [previousStatus, nextStatus] of [
      ["requested", "approved"],
      ["under_review", "processing_manual"],
      ["approved", "paid"],
      ["processing_manual", "rejected"],
      ["paid", "failed"]
    ] as const) {
      expect(() =>
        createOnlineWalletPayoutStateTransitionPlan({
          payoutRequestId: "payout-1",
          previousStatus,
          expectedVersion: "1",
          nextStatus
        })
      ).toThrow(OnlineWalletPayoutLifecycleError);
    }
  });
});
