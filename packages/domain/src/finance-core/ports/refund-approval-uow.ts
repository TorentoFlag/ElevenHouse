import type { VerifiedWalletOperationCommitReceipt } from "../wallet-operation-commit-binding-types";
import type { RefundPostingAllocationAuthorityV1 } from "../postings/refund-posting-types";
import type { UnverifiedRefundCumulativePosition } from "../postings/refund-cumulative-position-types";
import type {
  UnverifiedRefundFundingPosition,
  UnverifiedRefundFundingTransitionBinding
} from "../postings/refund-funding-position-types";
import type {
  FinanceCurrency,
  FinanceDigest,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";
import type { FinancePostingDecoderEnvelope } from "../postings/posting-decoder-envelope";
import type { PersistProviderOperationBeforeIoCommand } from "./provider-operation-intent-creation-uow";
import type { VerifiedRefundApprovalAuthority } from "./trusted-finance-evidence";
import type { SealedWalletJournalMutationCommand } from "./wallet-journal-commit-port";

declare const refundApprovalCommitReceiptBrand: unique symbol;

/**
 * An untrusted complete execution proposal. The approval UoW must rehydrate and cross-bind every
 * field to the trusted approval authority before it writes a wallet, ledger or provider intent.
 *
 * A refund allocation cannot be recomputed inside the UoW: a payout or another partial refund may
 * have changed the live lot graph since the authorized decision was made. The issuer therefore
 * supplies the exact sealed allocation and mutation it reviewed.
 */
export type RefundApprovalExecutionProposal = Readonly<{
  kind: "refund_approval_execution_proposal";
  allocation: RefundPostingAllocationAuthorityV1;
  /** Exact position that the allocation was evaluated against; never reconstructed from live lots. */
  resolvedCumulativePosition: UnverifiedRefundCumulativePosition;
  /** Immutable funding reservation transition; its digest becomes the case funding-coverage proof. */
  fundingTransitionBinding: UnverifiedRefundFundingTransitionBinding;
  /** Exact pre-reservation sources used to validate the funding transition. */
  resolvedFundingPositions: readonly UnverifiedRefundFundingPosition[];
  /** Null only when the approved allocation has no payable-lot reclassification. */
  walletJournalMutation: SealedWalletJournalMutationCommand | null;
  /**
   * The UoW derives the branded `refund_authorization` from `approvalAuthority`; callers cannot
   * carry a forged dispatch authorization into the provider-intent persistence boundary.
   */
  providerDispatch: Omit<
    Extract<PersistProviderOperationBeforeIoCommand, { operationKind: "refund" }>,
    "dispatchAuthorization"
  >;
}>;

export type ApproveRefundCommand = Readonly<{
  refundId: string;
  expectedRefundVersion: number;
  orderId: string;
  economicPaymentIntentId: string;
  walletId: string;
  expectedWalletRevision: string;
  expectedCumulativePositionVersion: string;
  expectedActivePayoutSetRevision: string;
  approvedCumulativeRefundMinor: string;
  currency: FinanceCurrency;
  approvalAuthority: VerifiedRefundApprovalAuthority;
  execution: RefundApprovalExecutionProposal;
  /** Server-resolved parser limits for the sealed refund posting evidence. */
  postingDecoderEnvelope: FinancePostingDecoderEnvelope;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type RefundApprovalCommitReceipt = Readonly<{
  kind: "refund_approval_commit_receipt";
  refundId: string;
  refundVersion: number;
  cumulativePositionVersion: string;
  approvedDeltaMinor: string;
  fundingCoverageDigest: FinanceDigest;
  fundingState: "provider_dispatch_ready" | "blocked_payout_outcome";
  providerOperationIntentId: string | null;
  walletJournalCommitReceipt: VerifiedWalletOperationCommitReceipt | null;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [refundApprovalCommitReceiptBrand]: true;
}>;

export type RefundApprovalUnitOfWork = Readonly<{
  approveRefund(command: ApproveRefundCommand): Promise<RefundApprovalCommitReceipt>;
}>;
