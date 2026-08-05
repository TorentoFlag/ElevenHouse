import type { PersistedVerifiedEconomicPaymentCaptureReceipt } from "../economic-payment";
import type { VerifiedWalletOperationCommitReceipt } from "../wallet-operation-commit-binding-types";
import type {
  FinanceDigest,
  FinanceEconomicPaymentHead,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";
import type { ProviderOperationResultCommitReceipt } from "./provider-operation-result-application-uow";
import type {
  SealedJournalMutationCommand,
  VerifiedFinanceJournalCommitReceipt
} from "./journal-commit-port";
import type { SealedWalletJournalMutationCommand } from "./wallet-journal-commit-port";

declare const verifiedCaptureApplicationCommitReceiptBrand: unique symbol;
declare const verifiedCaptureApplicationCommitReceiptRefBrand: unique symbol;

export type VerifiedCaptureApplicationCommitReceiptRef = Readonly<{
  kind: "verified_capture_application_commit_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: FinanceDigest;
  [verifiedCaptureApplicationCommitReceiptRefBrand]: true;
}>;

/** Untrusted complete proposal; the capture UoW rehydrates and authorizes exactly one variant. */
export type CaptureFinancialMutationProposal =
  | Readonly<{
      kind: "wallet_and_journal";
      command: SealedWalletJournalMutationCommand;
    }>
  | Readonly<{
      kind: "journal_only";
      command: SealedJournalMutationCommand;
    }>
  | Readonly<{
      kind: "no_posting";
      reason: "zero_amount_platform_card_setup";
    }>;

export type ApplyVerifiedCaptureCommand = Readonly<{
  economicPaymentIntentId: string;
  expectedEconomicPaymentVersion: number;
  providerOperationIntentId: string;
  expectedProviderOperationIntentVersion: number;
  /**
   * Positive-payable client sales use wallet+journal, 100%-commission sales and platform invoices
   * use journal-only, and only the zero-amount card-setup purpose may use no-posting.
   */
  financialMutation: CaptureFinancialMutationProposal;
  providerResult: ProviderOperationResultCommitReceipt &
    Readonly<{
      outcome: "succeeded";
      providerPaymentId: string;
      amountMinor: string;
      currency: "RUB";
    }>;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type VerifiedCaptureApplicationCommitReceipt = Readonly<{
  ref: VerifiedCaptureApplicationCommitReceiptRef;
  kind: "verified_capture_application_commit_receipt";
  economicPaymentHead: FinanceEconomicPaymentHead;
  providerOperationIntentId: string;
  providerOperationIntentVersion: number;
  economicEffectKind:
    | "client_sale_captured"
    | "platform_invoice_captured"
    | "platform_card_setup_captured";
  economicCaptureReceipt: PersistedVerifiedEconomicPaymentCaptureReceipt;
  journalCommitReceipt: VerifiedFinanceJournalCommitReceipt | null;
  walletJournalCommitReceipt: VerifiedWalletOperationCommitReceipt | null;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [verifiedCaptureApplicationCommitReceiptBrand]: true;
}>;

export type VerifiedCaptureApplicationUnitOfWork = Readonly<{
  applyVerifiedCapture(
    command: ApplyVerifiedCaptureCommand
  ): Promise<VerifiedCaptureApplicationCommitReceipt>;
}>;
