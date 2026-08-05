import type { PersistedVerifiedEconomicPaymentCaptureReceipt } from "../economic-payment";
import type { ResolvedFinanceOperationEnvelope } from "./finance-port-types";
import type {
  SealedJournalMutationCommand,
  VerifiedFinanceJournalCommitReceipt
} from "./journal-commit-port";
import type { SealedWalletJournalMutationCommand } from "./wallet-journal-commit-port";
import type { VerifiedWalletOperationCommitReceipt } from "../wallet-operation-commit-binding-types";
import type { VerifiedCaptureApplicationCommitReceiptRef } from "./verified-capture-application-uow";
import type { WebhookSemanticCommitReceipt } from "./webhook-inbox-persistence-port";

/**
 * DB-issued receipt for the canonical payment transition, not the result of creating an HPP
 * session. It is intentionally complete enough to bind the eventual capture transaction without
 * pretending that a checkout-session operation has captured money.
 */
export type VerifiedClientOrderCaptureSemanticCommitReceipt = Readonly<
  WebhookSemanticCommitReceipt & {
    kind: "webhook_semantic_commit_receipt";
    economicPaymentSessionId: string;
    purpose: "client_order";
    providerPaymentId: string;
    amountMinor: string;
    currency: "RUB";
    businessEffect: "applied_once";
  }
>;

export type ApplyCanonicalClientOrderCaptureCommand = Readonly<{
  economicPaymentIntentId: string;
  expectedEconomicPaymentVersion: number;
  semanticCapture: VerifiedClientOrderCaptureSemanticCommitReceipt;
  financialMutation:
    | Readonly<{ kind: "wallet_and_journal"; command: SealedWalletJournalMutationCommand }>
    | Readonly<{ kind: "journal_only"; command: SealedJournalMutationCommand }>;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type CanonicalClientOrderCaptureCommitReceipt = Readonly<{
  ref: VerifiedCaptureApplicationCommitReceiptRef;
  kind: "canonical_client_order_capture_commit_receipt";
  economicCaptureReceipt: PersistedVerifiedEconomicPaymentCaptureReceipt;
  journalCommitReceipt: VerifiedFinanceJournalCommitReceipt;
  walletJournalCommitReceipt: VerifiedWalletOperationCommitReceipt | null;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
}>;

/**
 * Applies exactly one captured client order from a sealed, canonical ArcPay payment-transition
 * fact. The implementation must atomically advance economic state, ledger, optional wallet,
 * clearing, order/booking and its capture-application receipt.
 */
export type CanonicalClientOrderCaptureUnitOfWork = Readonly<{
  applyCanonicalClientOrderCapture(
    command: ApplyCanonicalClientOrderCaptureCommand
  ): Promise<CanonicalClientOrderCaptureCommitReceipt>;
}>;
