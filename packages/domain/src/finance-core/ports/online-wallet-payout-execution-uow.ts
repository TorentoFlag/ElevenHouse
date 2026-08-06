import type { FinanceDigest } from "./finance-port-types";

declare const onlineWalletPayoutApprovalReceiptRefBrand: unique symbol;
declare const onlineWalletPayoutManualExecutionReceiptBrand: unique symbol;
declare const onlineWalletPayoutPaidReceiptRefBrand: unique symbol;
declare const onlineWalletPayoutPaidReceiptBrand: unique symbol;

/** Exact immutable approval fact; callers cannot substitute a mutable payout status for it. */
export type OnlineWalletPayoutApprovalReceiptRef = Readonly<{
  kind: "online_wallet_payout_approval_receipt";
  receiptId: string;
  canonicalDigest: FinanceDigest;
  [onlineWalletPayoutApprovalReceiptRefBrand]: true;
}>;

export type OnlineWalletPayoutExecutionAuthority = Readonly<{
  authorityId: string;
  authorityVersion: string;
  authorityDigest: FinanceDigest;
}>;

/** The operator has opened the bank transfer workflow; this is not a cash movement. */
export type StartOnlineWalletPayoutManualExecutionCommand = Readonly<{
  payoutRequestId: string;
  expectedPayoutVersion: string;
  expectedBankExposureVersion: string;
  approval: OnlineWalletPayoutApprovalReceiptRef;
  executorActorUserId: string;
  authority: OnlineWalletPayoutExecutionAuthority;
  occurredAt: string;
}>;

export type OnlineWalletPayoutManualExecutionCommitReceipt = Readonly<{
  kind: "online_wallet_payout_manual_execution_commit_receipt";
  effect: "applied_once" | "replayed";
  payoutRequestId: string;
  payoutVersion: string;
  bankExposureId: string;
  bankExposureVersion: string;
  state: "processing_manual";
  persistenceTransactionBoundaryRef: string;
  [onlineWalletPayoutManualExecutionReceiptBrand]: true;
}>;

/**
 * Confirmed manual-bank fact. The private artifact is required before the payable can leave the
 * astrologer's internal balance; a statement match later settles bank_outbound_clearing.
 */
export type ConfirmOnlineWalletPayoutPaidCommand = Readonly<{
  payoutRequestId: string;
  expectedPayoutVersion: string;
  expectedWalletRevision: string;
  expectedBankExposureVersion: string;
  approval: OnlineWalletPayoutApprovalReceiptRef;
  bankReference: string;
  transferredAt: string;
  evidenceArtifactId: string;
  evidenceArtifactDigest: FinanceDigest;
  confirmerActorUserId: string;
  authority: OnlineWalletPayoutExecutionAuthority;
  occurredAt: string;
}>;

export type OnlineWalletPayoutPaidReceiptRef = Readonly<{
  kind: "online_wallet_payout_paid_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: FinanceDigest;
  [onlineWalletPayoutPaidReceiptRefBrand]: true;
}>;

export type OnlineWalletPayoutPaidCommitReceipt = Readonly<{
  ref: OnlineWalletPayoutPaidReceiptRef;
  kind: "online_wallet_payout_paid_commit_receipt";
  effect: "applied_once" | "replayed";
  payoutRequestId: string;
  payoutVersion: string;
  walletId: string;
  walletRevision: string;
  walletMutationId: string;
  journalTransactionId: string;
  bankExposureId: string;
  bankExposureVersion: string;
  bankExposureState: "paid_unreflected";
  persistenceTransactionBoundaryRef: string;
  [onlineWalletPayoutPaidReceiptBrand]: true;
}>;

export type OnlineWalletPayoutExecutionUnitOfWork = Readonly<{
  startOnlineWalletPayoutManualExecution(
    command: StartOnlineWalletPayoutManualExecutionCommand
  ): Promise<OnlineWalletPayoutManualExecutionCommitReceipt>;
  confirmOnlineWalletPayoutPaid(
    command: ConfirmOnlineWalletPayoutPaidCommand
  ): Promise<OnlineWalletPayoutPaidCommitReceipt>;
}>;
