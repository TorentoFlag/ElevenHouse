import type { VerifiedWalletOperationCommitReceipt } from "../wallet-operation-commit-binding-types";
import type { SealedWalletJournalMutationCommand } from "./wallet-journal-commit-port";
import type { ResolvedFinanceOperationEnvelope } from "./finance-port-types";
import type { ProviderOperationResultCommitReceipt } from "./provider-operation-result-application-uow";
import type { VerifiedRefundProviderOutcome } from "./trusted-finance-evidence";
import type { RefundPostingAllocationAuthorityV1 } from "../postings/refund-posting-types";
import type { UnverifiedRefundTerminalEvidenceBindingV1 } from "../postings/refund-posting-types";
import type { UnverifiedRefundCumulativePosition } from "../postings/refund-cumulative-position-types";
import type {
  UnverifiedRefundFundingPosition,
  UnverifiedRefundFundingTransitionBinding
} from "../postings/refund-funding-position-types";
import type { RefundConfirmedAuthority, RefundFailedAuthority } from "../source-lot-types";
import type { FinancePostingDecoderEnvelope } from "../postings/posting-decoder-envelope";
import type {
  buildRefundConfirmedPosting,
  buildRefundFailedPosting
} from "../postings/refund-terminal-posting";

declare const refundResultApplicationCommitReceiptBrand: unique symbol;

/**
 * Exact terminal evidence reviewed by the refund authority. The application UoW rehydrates and
 * cross-binds this proposal to the persisted approval; it must never recompute a reversal from a
 * later wallet/payout graph.
 */
export type RefundTerminalPostingProposal =
  | ReturnType<typeof buildRefundConfirmedPosting>
  | ReturnType<typeof buildRefundFailedPosting>;

export type RefundResultExecutionProposal = Readonly<{
  kind: "refund_result_execution_proposal";
  allocation: RefundPostingAllocationAuthorityV1;
  resolvedPriorAllocation: RefundPostingAllocationAuthorityV1 | null;
  resolvedCumulativePosition: UnverifiedRefundCumulativePosition;
  /** Positions as reserved by the approved transition, before terminal consume/release. */
  resolvedFundingPositions: readonly UnverifiedRefundFundingPosition[];
  fundingTransitionBinding: UnverifiedRefundFundingTransitionBinding;
  terminalAuthority: RefundConfirmedAuthority | RefundFailedAuthority;
  terminalEvidenceBinding: UnverifiedRefundTerminalEvidenceBindingV1;
  terminalPosting: RefundTerminalPostingProposal;
  /** Null only where the terminal posting has no payable-lot transition. */
  walletJournalMutation: SealedWalletJournalMutationCommand | null;
}>;

export type ApplyVerifiedRefundResultCommand = Readonly<{
  refundId: string;
  expectedRefundVersion: number;
  walletId: string;
  expectedWalletRevision: string;
  expectedCumulativePositionVersion: string;
  providerResult: ProviderOperationResultCommitReceipt &
    Readonly<{ operationKind: "refund"; outcome: "succeeded" | "failed" }>;
  refundOutcome: VerifiedRefundProviderOutcome & Readonly<{ outcome: "succeeded" | "failed" }>;
  execution: RefundResultExecutionProposal;
  /** Server-resolved limits for rehydrating the approved terminal proposal. */
  postingDecoderEnvelope: FinancePostingDecoderEnvelope;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type RefundResultApplicationCommitReceipt = Readonly<{
  kind: "refund_result_application_commit_receipt";
  refundId: string;
  refundVersion: number;
  cumulativePositionVersion: string;
  terminalOutcome: "succeeded" | "failed";
  /** Null only for a state-only terminal refund with no payable-lot transition. */
  walletJournalCommitReceipt: VerifiedWalletOperationCommitReceipt | null;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [refundResultApplicationCommitReceiptBrand]: true;
}>;

export type RefundResultApplicationUnitOfWork = Readonly<{
  applyVerifiedRefundResult(
    command: ApplyVerifiedRefundResultCommand
  ): Promise<RefundResultApplicationCommitReceipt>;
}>;
