import type { BankLiquiditySnapshotAdoptionReceiptRef } from "./bank-cash-pool-port";
import type {
  FinanceCurrency,
  FinanceDigest,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";
import type {
  VerifiedPayoutApprovalAuthority,
  VerifiedPayoutDestinationSnapshot
} from "./trusted-finance-evidence";

declare const payoutReviewApprovalCommitReceiptBrand: unique symbol;
declare const payoutApprovalCommitReceiptRefBrand: unique symbol;

export type PayoutApprovalCommitReceiptRef = Readonly<{
  kind: "payout_approval_commit_receipt";
  receiptId: string;
  version: number;
  canonicalDigest: FinanceDigest;
  [payoutApprovalCommitReceiptRefBrand]: true;
}>;

type PayoutReviewApprovalCommandBase = Readonly<{
  payoutRequestId: string;
  expectedPayoutVersion: number;
  expectedBeneficiaryFingerprint: FinanceDigest;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type ReviewOrApprovePayoutCommand =
  | Readonly<
      PayoutReviewApprovalCommandBase & {
        action: "start_review";
        reviewerActorId: string;
      }
    >
  | Readonly<
      PayoutReviewApprovalCommandBase & {
        action: "approve";
        approvalAuthority: VerifiedPayoutApprovalAuthority;
        destination: VerifiedPayoutDestinationSnapshot;
        bankCashPoolId: string;
        currency: FinanceCurrency;
        expectedBankLiquidityRevision: string;
        adoptedLiquiditySnapshot: BankLiquiditySnapshotAdoptionReceiptRef;
      }
    >;

export type PayoutReviewApprovalCommitReceipt = Readonly<{
  kind: "payout_review_approval_commit_receipt";
  payoutRequestId: string;
  payoutVersion: number;
  state: "under_review" | "approved";
  approvalRef: PayoutApprovalCommitReceiptRef | null;
  reviewerActorId: string;
  approverActorId: string | null;
  payoutMethodId: string | null;
  payoutMethodVersion: number | null;
  beneficiaryFingerprint: FinanceDigest;
  immutableAmountMinor: string;
  currency: FinanceCurrency;
  bankExposureId: string | null;
  bankExposureVersion: number | null;
  bankLiquidityRevision: string | null;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [payoutReviewApprovalCommitReceiptBrand]: true;
}>;

export type PayoutReviewApprovalUnitOfWork = Readonly<{
  /**
   * Approval locks the request, exact current payout-method version, liquidity head and exposure.
   * It rejects reviewer === approver and any changed/replaced/revoked destination; a destination
   * change invalidates the old approval and requires a new review/authorization cycle.
   */
  reviewOrApprovePayout(
    command: ReviewOrApprovePayoutCommand
  ): Promise<PayoutReviewApprovalCommitReceipt>;
}>;
