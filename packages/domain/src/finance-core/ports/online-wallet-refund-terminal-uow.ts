import type { ApplyVerifiedWebhookSemanticFactCommand } from "./webhook-inbox-persistence-port";

export type ApplyCanonicalApprovedOnlineWalletRefundCommand = Readonly<{
  semanticFact: ApplyVerifiedWebhookSemanticFactCommand;
  refundCaseId: string;
  providerPaymentId: string;
  providerRefundId: string;
  previousCumulativeRefundedMinor: string;
  cumulativeRefundedMinor: string;
  occurredAt: string;
}>;

export type OnlineWalletRefundTerminalUnitOfWork = Readonly<{
  applyCanonicalApprovedOnlineWalletRefund(command: ApplyCanonicalApprovedOnlineWalletRefundCommand): Promise<Readonly<{
    effect: "applied_once" | "semantic_replay";
    refundCaseId: string;
    walletId: string;
    walletRevision: string;
  }>>;
}>;
