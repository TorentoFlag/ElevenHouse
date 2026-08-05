import type { VerifiedWalletOperationCommitReceipt } from "../wallet-operation-commit-binding-types";
import type {
  FinanceCurrency,
  FinanceDigest,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";
import type { VerifiedPayoutDestinationSnapshot } from "./trusted-finance-evidence";
import type { SealedWalletJournalMutationCommand } from "./wallet-journal-commit-port";

declare const payoutRequestCommitReceiptBrand: unique symbol;

export type CreatePayoutRequestCommand = Readonly<{
  payoutRequestId: string;
  walletId: string;
  astrologerUserId: string;
  expectedWalletRevision: string;
  amountMinor: string;
  currency: FinanceCurrency;
  destination: VerifiedPayoutDestinationSnapshot;
  /**
   * Exact, reviewed payable-lot move and linked journal posting. The request adapter must not
   * reconstruct this graph from a mutable wallet: it persists this sealed mutation atomically
   * with the immutable payout aggregate.
   */
  walletJournalMutation: SealedWalletJournalMutationCommand;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type PayoutRequestCommitReceipt = Readonly<{
  kind: "payout_request_commit_receipt";
  payoutRequestId: string;
  payoutVersion: number;
  immutableAmountMinor: string;
  currency: FinanceCurrency;
  beneficiaryFingerprint: FinanceDigest;
  payoutAllocationSetDigest: FinanceDigest;
  payoutAllocationCount: number;
  walletJournalCommitReceipt: VerifiedWalletOperationCommitReceipt;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [payoutRequestCommitReceiptBrand]: true;
}>;

export type PayoutRequestUnitOfWork = Readonly<{
  createPayoutRequest(command: CreatePayoutRequestCommand): Promise<PayoutRequestCommitReceipt>;
}>;
