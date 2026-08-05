import type { ApplyVerifiedWebhookSemanticFactCommand } from "./webhook-inbox-persistence-port";

/**
 * The signed ArcPay `payment.chargeback` notice is authoritative only for the provisional
 * provider principal loss. This port deliberately does not contain a recovery/debt decision or
 * provider-fee amount: both require independently approved evidence.
 */
export type ApplyVerifiedOnlineWalletChargebackNoticeCommand = Readonly<{
  semanticFact: ApplyVerifiedWebhookSemanticFactCommand;
  chargeback: Readonly<{
    providerPaymentId: string;
    providerSource: Readonly<
      | { kind: "provider_chargeback_id"; providerChargebackId: string }
      | { kind: "webhook_event_id"; webhookEventId: string }
    >;
    disputedPrincipalMinor: string;
    occurredAt: string;
  }>;
}>;

export type OnlineWalletChargebackCaseCommitReceipt = Readonly<{
  kind: "online_wallet_chargeback_case_commit_receipt";
  effect: "applied_once" | "semantic_replay";
  chargebackCaseId: string;
  walletId: string;
  rootLotId: string;
  journalTransactionId: string;
}>;

export type OnlineWalletChargebackCaseUnitOfWork = Readonly<{
  applyVerifiedOnlineWalletChargebackNotice(
    command: ApplyVerifiedOnlineWalletChargebackNoticeCommand
  ): Promise<OnlineWalletChargebackCaseCommitReceipt>;
}>;
