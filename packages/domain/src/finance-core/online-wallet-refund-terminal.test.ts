import { describe, expect, it } from "vitest";

import { createOnlineWalletRefundPendingConfirmedJournal } from "./online-wallet-refund-terminal";

describe("createOnlineWalletRefundPendingConfirmedJournal", () => {
  it("settles only the pre-reserved payable balance and commission into provider clearing", () => {
    const journal = createOnlineWalletRefundPendingConfirmedJournal({
      refundCaseId: "refund-case-1", orderId: "order-1", providerAccountId: "arc-1",
      astrologerUserId: "astro-1", occurredAt: "2026-08-06T00:00:00.000Z", postedAt: "2026-08-06T00:00:00.000Z",
      commissionReversalMinor: 100, grossAmountMinor: 1_000,
      consumptions: [{ refundPendingAllocationId: "pending-1", rootLotId: "root-1", amountMinor: 900 }]
    });
    expect(journal.totalDebitMinor).toBe("1000");
    expect(journal.totalCreditMinor).toBe("1000");
    expect(journal.entries.map((entry) => entry.account.code)).toEqual([
      "platform_commission_revenue", "astrologer_refund_pending", "arc_provider_clearing"
    ]);
  });
});
