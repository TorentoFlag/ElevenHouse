import type {
  FinanceJournalLinkProof,
  UnverifiedFinancePostingRecipe
} from "../postings/posting-types";
import type { PayableLotOperationReceipt } from "../source-lot-operation-receipt-types";
import type { PayableLotTransition } from "../source-lot-types";
import type {
  VerifiedWalletOperationCommitReceipt,
  WalletOperationCommitBindingRecord
} from "../wallet-operation-commit-binding-types";
import type {
  FinanceCurrency,
  ResolvedFinanceWalletOperationEnvelope
} from "./finance-port-types";

export type SealedWalletJournalMutationCommand = Readonly<{
  operationId: string;
  walletId: string;
  astrologerUserId: string;
  currency: FinanceCurrency;
  expectedWalletRevision: string;
  sourceLotTransition: PayableLotTransition;
  sourceTransitionReceipt: PayableLotOperationReceipt;
  postingRecipe: Extract<UnverifiedFinancePostingRecipe, { kind: "journal" }>;
  journalLinkProof: FinanceJournalLinkProof;
  commitBinding: WalletOperationCommitBindingRecord;
  operationEnvelope: ResolvedFinanceWalletOperationEnvelope;
}>;

/**
 * The adapter validates the exact in-memory transition/recipe/proof/binding, derives and locks
 * the bounded affected set, then creates and seals every journal/lot/wallet row plus the opaque
 * receipt in one transaction. No precommitted unsealed staging record is part of this contract.
 */
export type SealedWalletJournalCommitUnitOfWork = Readonly<{
  commitSealedWalletJournalMutation(
    command: SealedWalletJournalMutationCommand
  ): Promise<VerifiedWalletOperationCommitReceipt>;
}>;
