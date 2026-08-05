import { describe, expect, it } from "vitest";

import {
  OnlineWalletRefundPlanIntegrityError,
  createOnlineWalletRefundPlan
} from "./online-wallet-refund-plan";

describe("createOnlineWalletRefundPlan", () => {
  it("uses the cumulative proportional commission delta and consumes exact open source positions", () => {
    const plan = createOnlineWalletRefundPlan({
      refundId: "refund-1",
      grossAmountMinor: 5_000,
      originalGrossAmountMinor: 10_000,
      commissionBps: 400,
      previousRefundedGrossMinor: 2_500,
      cumulativeRefundedGrossMinor: 7_500,
      sources: [
        {
          sourceKind: "allocation",
          sourceId: "available-1",
          rootLotId: "root-1",
          bucket: "available",
          amountMinor: 2_400
        },
        {
          sourceKind: "allocation",
          sourceId: "reserved-1",
          rootLotId: "root-1",
          bucket: "reserved",
          amountMinor: 5_000
        }
      ]
    });

    // Commission for 7,500 at 4% is 300; for the prior 2,500 it is 100.
    expect(plan).toMatchObject({
      commissionReversalMinor: 200,
      payableReversalMinor: 4_800,
      blockedPayoutOutcomeMinor: 0,
      consumptions: [
        {
          sourceId: "available-1",
          consumedMinor: 2_400,
          remainderMinor: 0
        },
        {
          sourceId: "reserved-1",
          consumedMinor: 2_400,
          remainderMinor: 2_600
        }
      ]
    });
  });

  it("blocks a paid-out shortfall instead of creating a receivable without an approved policy", () => {
    const plan = createOnlineWalletRefundPlan({
      refundId: "refund-2",
      grossAmountMinor: 10_000,
      originalGrossAmountMinor: 10_000,
      commissionBps: 400,
      previousRefundedGrossMinor: 0,
      cumulativeRefundedGrossMinor: 10_000,
      sources: [
        {
          sourceKind: "allocation",
          sourceId: "available-1",
          rootLotId: "root-1",
          bucket: "available",
          amountMinor: 3_000
        }
      ]
    });

    expect(plan.payableReversalMinor).toBe(9_600);
    expect(plan.blockedPayoutOutcomeMinor).toBe(6_600);
  });

  it("does not consume a payout-pending component while a manual bank transfer may still be in flight", () => {
    const plan = createOnlineWalletRefundPlan({
      refundId: "refund-3",
      grossAmountMinor: 5_000,
      originalGrossAmountMinor: 10_000,
      commissionBps: 400,
      previousRefundedGrossMinor: 0,
      cumulativeRefundedGrossMinor: 5_000,
      sources: [
        {
          sourceKind: "allocation",
          sourceId: "payout-pending-1",
          rootLotId: "root-1",
          bucket: "payout_pending",
          amountMinor: 4_800
        }
      ]
    });

    expect(plan.consumptions).toEqual([]);
    expect(plan.payableReversalMinor).toBe(4_800);
    expect(plan.blockedPayoutOutcomeMinor).toBe(4_800);
  });

  it("rejects a cumulative amount that does not match the reported refund delta", () => {
    expect(() =>
      createOnlineWalletRefundPlan({
        refundId: "refund-4",
        grossAmountMinor: 1_000,
        originalGrossAmountMinor: 10_000,
        commissionBps: 400,
        previousRefundedGrossMinor: 1_000,
        cumulativeRefundedGrossMinor: 2_500,
        sources: []
      })
    ).toThrow(OnlineWalletRefundPlanIntegrityError);
  });
});
