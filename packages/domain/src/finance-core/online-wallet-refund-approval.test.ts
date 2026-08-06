import { describe, expect, it } from "vitest";

import {
  OnlineWalletRefundApprovalIntegrityError,
  createOnlineWalletRefundApprovalJournal,
  createOnlineWalletRefundApprovalPlan
} from "./online-wallet-refund-approval";

describe("online wallet refund approval plan", () => {
  it("reserves the exact proportional payable value in V2 refund-pending children", () => {
    const plan = createOnlineWalletRefundApprovalPlan({
      refundCaseId: "refund-case-1",
      grossAmountMinor: 2_500,
      originalGrossAmountMinor: 10_000,
      commissionBps: 1_000,
      previousRefundedGrossMinor: 0,
      cumulativeRefundedGrossMinor: 2_500,
      sources: [
        {
          sourceKind: "allocation",
          sourceId: "available-a",
          rootLotId: "root-a",
          bucket: "available",
          amountMinor: 2_250
        }
      ]
    });

    expect(plan).toEqual({
      commissionReversalMinor: 250,
      payableReservationMinor: 2_250,
      blockedPayoutOutcomeMinor: 0,
      consumptions: [
        {
          sourceKind: "allocation",
          sourceId: "available-a",
          rootLotId: "root-a",
          bucket: "available",
          sourceAmountMinor: 2_250,
          reservedMinor: 2_250,
          remainderMinor: 0,
          refundPendingAllocationId: "online-wallet-refund-pending:refund-case-1:0"
        }
      ]
    });
  });

  it("does not reserve payout-pending value for a new provider refund", () => {
    const plan = createOnlineWalletRefundApprovalPlan({
      refundCaseId: "refund-case-1",
      grossAmountMinor: 2_500,
      originalGrossAmountMinor: 10_000,
      commissionBps: 1_000,
      previousRefundedGrossMinor: 0,
      cumulativeRefundedGrossMinor: 2_500,
      sources: [
        {
          sourceKind: "allocation",
          sourceId: "payout-a",
          rootLotId: "root-a",
          bucket: "payout_pending",
          amountMinor: 2_250
        }
      ]
    });

    expect(plan.blockedPayoutOutcomeMinor).toBe(2_250);
    expect(plan.consumptions).toEqual([]);
  });

  it("rejects a cumulative amount that does not describe the requested delta", () => {
    expect(() =>
      createOnlineWalletRefundApprovalPlan({
        refundCaseId: "refund-case-1",
        grossAmountMinor: 2_500,
        originalGrossAmountMinor: 10_000,
        commissionBps: 1_000,
        previousRefundedGrossMinor: 500,
        cumulativeRefundedGrossMinor: 2_500,
        sources: []
      })
    ).toThrow(OnlineWalletRefundApprovalIntegrityError);
  });

  it("posts approval as a liability reclassification, not a provider-clearing movement", () => {
    const journal = createOnlineWalletRefundApprovalJournal({
      refundCaseId: "refund-case-1",
      astrologerUserId: "astrologer-1",
      occurredAt: "2026-08-06T10:00:00.000Z",
      postedAt: "2026-08-06T10:00:00.000Z",
      consumptions: [
        {
          sourceKind: "allocation",
          sourceId: "available-a",
          rootLotId: "root-a",
          orderId: "order-1",
          bucket: "available",
          sourceAmountMinor: 2_250,
          reservedMinor: 2_250,
          remainderMinor: 0,
          refundPendingAllocationId: "online-wallet-refund-pending:refund-case-1:0"
        }
      ]
    });

    expect(journal.sourceKey).toEqual({ kind: "refund", sourceId: "refund-case-1", operation: "approved" });
    expect(journal.entries).toEqual([
      expect.objectContaining({ account: expect.objectContaining({ code: "astrologer_available" }), side: "debit", amount: { amountMinor: 2_250, currency: "RUB" } }),
      expect.objectContaining({ account: expect.objectContaining({ code: "astrologer_refund_pending" }), side: "credit", amount: { amountMinor: 2_250, currency: "RUB" } })
    ]);
  });
});
