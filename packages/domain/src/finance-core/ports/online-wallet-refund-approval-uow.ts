import type { PersistProviderOperationBeforeIoCommand } from "./provider-operation-intent-creation-uow";
import type { VerifiedOnlineWalletRefundApprovalAuthority } from "./trusted-finance-evidence";
import type { FinanceDigest } from "./finance-port-types";

declare const onlineWalletRefundApprovalReceiptBrand: unique symbol;

export type ApproveOnlineWalletRefundCommand = Readonly<{
  authority: VerifiedOnlineWalletRefundApprovalAuthority;
  expectedWalletRevision: string;
  /** Prepared private provider-request artifact; never an unsealed browser payload. */
  providerDispatch: Omit<
    Extract<PersistProviderOperationBeforeIoCommand, { operationKind: "refund" }>,
    "dispatchAuthorization"
  >;
}>;

export type OnlineWalletRefundApprovalCommitReceipt = Readonly<{
  kind: "online_wallet_refund_approval_commit_receipt";
  effect: "approved_once" | "replayed";
  refundCaseId: string;
  walletId: string;
  walletRevision: string;
  approvalMutationId: string;
  approvalJournalTransactionId: string;
  providerOperationIntentId: string;
  allocationDigest: FinanceDigest;
  persistenceTransactionBoundaryRef: string;
  [onlineWalletRefundApprovalReceiptBrand]: true;
}>;

export type OnlineWalletRefundApprovalUnitOfWork = Readonly<{
  approveOnlineWalletRefund(
    command: ApproveOnlineWalletRefundCommand
  ): Promise<OnlineWalletRefundApprovalCommitReceipt>;
}>;
