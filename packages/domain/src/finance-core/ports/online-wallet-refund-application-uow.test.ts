import { describe, expect, it } from "vitest";

import type {
  ApplyCanonicalOnlineWalletRefundCommand,
  OnlineWalletRefundApplicationCommitReceipt
} from "./online-wallet-refund-application-uow";

describe("online wallet refund application port", () => {
  it("keeps a provider-confirmed refund and its blocked payout outcome in one V2 boundary", () => {
    const command = {
      semanticFact: { inboxItemId: "inbox-refund-1" },
      refund: {
        providerPaymentId: "payment-1",
        providerRefundId: "refund-1",
        refundDeltaMinor: "5000",
        previousCumulativeRefundedMinor: "0",
        cumulativeRefundedMinor: "5000",
        occurredAt: "2026-08-05T12:00:00.000Z"
      }
    } as ApplyCanonicalOnlineWalletRefundCommand;

    const receipt = {
      kind: "online_wallet_refund_application_commit_receipt",
      effect: "blocked_payout_outcome",
      providerRefundId: command.refund.providerRefundId,
      walletId: "wallet-1",
      walletRevision: "2",
      walletMutationId: null,
      journalTransactionId: null,
      blockedPayoutOutcomeMinor: "2400"
    } satisfies OnlineWalletRefundApplicationCommitReceipt;

    expect(receipt.effect).toBe("blocked_payout_outcome");
    expect(receipt.walletMutationId).toBeNull();
  });
});
