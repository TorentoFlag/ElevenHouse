import type {
  FinanceJournalLinkProof,
  UnverifiedFinancePostingRecipe
} from "../postings/posting-types";
import type { FinanceDigest, ResolvedFinanceJournalOperationEnvelope } from "./finance-port-types";

declare const verifiedFinanceJournalCommitReceiptBrand: unique symbol;
declare const verifiedFinanceJournalCommitReceiptRefBrand: unique symbol;

export type SealedJournalMutationCommand = Readonly<{
  operationId: string;
  postingRecipe: Extract<UnverifiedFinancePostingRecipe, { kind: "journal" }>;
  journalLinkProof: FinanceJournalLinkProof;
  operationEnvelope: ResolvedFinanceJournalOperationEnvelope;
}>;

export type VerifiedFinanceJournalCommitReceiptRef = Readonly<{
  kind: "verified_finance_journal_commit_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: FinanceDigest;
  [verifiedFinanceJournalCommitReceiptRefBrand]: true;
}>;

export type VerifiedFinanceJournalCommitReceipt = Readonly<{
  ref: VerifiedFinanceJournalCommitReceiptRef;
  kind: "verified_finance_journal_commit_receipt";
  journalTransactionId: string;
  journalTransactionDigest: FinanceDigest;
  journalLinkProofId: string;
  journalLinkProofVersion: 1;
  journalLinkProofDigest: FinanceDigest;
  persistenceTransactionBoundaryRef: string;
  issuedAt: string;
  [verifiedFinanceJournalCommitReceiptBrand]: true;
}>;
