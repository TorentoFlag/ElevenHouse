import type { ApplyVerifiedWebhookSemanticFactCommand } from "./webhook-inbox-persistence-port";

/**
 * Applies an ArcPay refund only after the worker has re-read and sealed the exact provider
 * payment resource. The numeric progression is canonical-provider evidence, not webhook data.
 */
export type ApplyCanonicalOnlineWalletRefundCommand = Readonly<{
  semanticFact: ApplyVerifiedWebhookSemanticFactCommand;
  refund: Readonly<{
    providerPaymentId: string;
    providerRefundId: string;
    refundDeltaMinor: string;
    previousCumulativeRefundedMinor: string;
    cumulativeRefundedMinor: string;
    occurredAt: string;
  }>;
}>;

export type OnlineWalletRefundApplicationCommitReceipt = Readonly<{
  kind: "online_wallet_refund_application_commit_receipt";
  effect: "applied_once" | "semantic_replay" | "blocked_payout_outcome";
  providerRefundId: string;
  walletId: string;
  walletRevision: string;
  walletMutationId: string | null;
  journalTransactionId: string | null;
  blockedPayoutOutcomeMinor: string;
}>;

export type OnlineWalletRefundApplicationUnitOfWork = Readonly<{
  applyCanonicalOnlineWalletRefund(
    command: ApplyCanonicalOnlineWalletRefundCommand
  ): Promise<OnlineWalletRefundApplicationCommitReceipt>;
}>;
