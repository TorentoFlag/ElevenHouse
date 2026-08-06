import type { OnlineWalletPayoutStatus } from "../online-wallet-payout-lifecycle";
import type { BankLiquiditySnapshotAdoptionReceiptRef } from "./bank-cash-pool-port";
import type { FinanceDigest, ResolvedFinanceOperationEnvelope } from "./finance-port-types";

export type OnlineWalletPayoutTransitionAuthority = Readonly<{
  authorityId: string;
  authorityVersion: string;
  authorityDigest: FinanceDigest;
}>;

export type TransitionOnlineWalletPayoutCommand = Readonly<{
  payoutRequestId: string;
  expectedPayoutVersion: string;
  /**
   * These transitions deliberately only change the reviewed payout aggregate. Terminal
   * no-transfer and paid transitions own their corresponding wallet/bank journal moves in
   * dedicated units of work and must never be sent through this state-only port.
   */
  /** Approval and bank initiation have dedicated, evidence-bound UOWs. */
  nextStatus: "under_review";
  actorUserId: string;
  adminNote: string | null;
  authority: OnlineWalletPayoutTransitionAuthority;
  occurredAt: string;
}>;

export type OnlineWalletPayoutReviewCommitReceipt = Readonly<{
  kind: "online_wallet_payout_review_commit_receipt";
  effect: "applied_once" | "replayed";
  payoutRequestId: string;
  previousStatus: OnlineWalletPayoutStatus;
  status: "under_review";
  payoutVersion: string;
}>;

export type ApproveOnlineWalletPayoutCommand = Readonly<{
  payoutRequestId: string;
  expectedPayoutVersion: string;
  expectedBeneficiaryFingerprint: FinanceDigest;
  actorUserId: string;
  authority: OnlineWalletPayoutTransitionAuthority;
  bankCashPoolId: string;
  currency: "RUB";
  expectedBankLiquidityRevision: string;
  adoptedLiquiditySnapshot: BankLiquiditySnapshotAdoptionReceiptRef;
  occurredAt: string;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type OnlineWalletPayoutApprovalCommitReceipt = Readonly<{
  kind: "online_wallet_payout_approval_commit_receipt";
  effect: "applied_once" | "replayed";
  payoutRequestId: string;
  payoutVersion: string;
  bankExposureId: string;
  bankExposureVersion: string;
  bankLiquidityRevision: string;
  approvalReceiptId: string;
  approvalReceiptDigest: FinanceDigest;
  persistenceTransactionBoundaryRef: string;
}>;

export type OnlineWalletPayoutReviewUnitOfWork = Readonly<{
  transitionOnlineWalletPayout(
    command: TransitionOnlineWalletPayoutCommand
  ): Promise<OnlineWalletPayoutReviewCommitReceipt>;
  approveOnlineWalletPayout(
    command: ApproveOnlineWalletPayoutCommand
  ): Promise<OnlineWalletPayoutApprovalCommitReceipt>;
}>;
