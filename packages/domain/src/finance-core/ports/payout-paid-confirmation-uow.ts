import type { VerifiedWalletOperationCommitReceipt } from "../wallet-operation-commit-binding-types";
import type { FinanceDigest, ResolvedFinanceOperationEnvelope } from "./finance-port-types";
import type { PayoutApprovalCommitReceiptRef } from "./payout-review-approval-uow";
import type {
  VerifiedPayoutDestinationSnapshot,
  VerifiedPayoutPaidEvidence
} from "./trusted-finance-evidence";

declare const payoutPaidConfirmationCommitReceiptBrand: unique symbol;
declare const payoutPaidConfirmationCommitReceiptRefBrand: unique symbol;

export type PayoutPaidConfirmationCommitReceiptRef = Readonly<{
  kind: "payout_paid_confirmation_commit_receipt";
  receiptId: string;
  version: number;
  canonicalDigest: FinanceDigest;
  [payoutPaidConfirmationCommitReceiptRefBrand]: true;
}>;

export type ConfirmPayoutPaidCommand = Readonly<{
  payoutRequestId: string;
  expectedPayoutVersion: number;
  walletId: string;
  expectedWalletRevision: string;
  bankExposureId: string;
  expectedBankExposureVersion: number;
  approval: PayoutApprovalCommitReceiptRef;
  destination: VerifiedPayoutDestinationSnapshot;
  paidEvidence: VerifiedPayoutPaidEvidence;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type PayoutPaidConfirmationCommitReceipt = Readonly<{
  ref: PayoutPaidConfirmationCommitReceiptRef;
  kind: "payout_paid_confirmation_commit_receipt";
  payoutRequestId: string;
  payoutVersion: number;
  state: "paid";
  bankExposureId: string;
  bankExposureVersion: number;
  bankExposureState: "paid_unreflected";
  walletJournalCommitReceipt: VerifiedWalletOperationCommitReceipt;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [payoutPaidConfirmationCommitReceiptBrand]: true;
}>;

export type PayoutPaidConfirmationUnitOfWork = Readonly<{
  /**
   * Revalidates the locked request, active approval, exact immutable destination and exposure.
   * Reviewer/approver must differ, and the paid confirmer must differ from both approver and
   * executor before the payout liability and outbound clearing can be committed.
   */
  confirmPayoutPaid(
    command: ConfirmPayoutPaidCommand
  ): Promise<PayoutPaidConfirmationCommitReceipt>;
}>;
