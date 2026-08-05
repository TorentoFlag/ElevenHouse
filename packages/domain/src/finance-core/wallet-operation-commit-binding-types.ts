import type { FinanceSourceKey } from "./finance-source-key";
import type { FinanceAuthorizationPayloadHash } from "../finance-authorization/canonical-command-payload";
import type { UnverifiedWalletProjectionLimitPolicySnapshot } from "./wallet-operation-snapshot-types";

export type PayableLotOperationReceiptRef = Readonly<{
  kind: "payable_lot_operation_receipt";
  receiptId: string;
  schemaVersion: 1;
  canonicalDigest: string;
}>;

export type FinanceJournalLinkProofRef = Readonly<{
  kind: "finance_allocation_link_proof";
  proofId: string;
  version: 1;
  proofDigest: FinanceAuthorizationPayloadHash;
}>;

declare const verifiedWalletOperationCommitReceiptBrand: unique symbol;

export type VerifiedWalletOperationCommitReceipt = Readonly<{
  kind: "verified_wallet_operation_commit_receipt";
  receiptId: string;
  version: string;
  canonicalDigest: string;
  bindingRecordId: string;
  bindingDigest: string;
  payableLotOperationReceiptRef: PayableLotOperationReceiptRef;
  financeJournalLinkProofRef: FinanceJournalLinkProofRef;
  walletId: string;
  previousWalletRevision: string;
  nextWalletRevision: string;
  mutationSequence: string;
  persistenceTransactionBoundaryRef: string;
  issuedAt: string;
  [verifiedWalletOperationCommitReceiptBrand]: true;
}>;

export type WalletOperationCommitBindingRecord = Readonly<{
  schemaVersion: 1;
  authorizationStatus: "unverified";
  atomicityStatus: "unverified";
  bindingId: string;
  operationId: string;
  sourceKey: FinanceSourceKey;
  occurredAt: string;
  journalTransactionId: string;
  journalTransactionDigest: string;
  operationSnapshotId: string;
  operationSnapshotDigest: string;
  unverifiedLimitPolicy: UnverifiedWalletProjectionLimitPolicySnapshot;
  historyRecordDigest: string;
  previousLotStateDigest: string;
  nextLotStateDigest: string;
  previousWalletId: string;
  nextWalletId: string;
  astrologerUserId: string;
  currency: "RUB";
  previousWalletRevision: string;
  nextWalletRevision: string;
  previousWalletSnapshotDigest: string;
  nextWalletSnapshotDigest: string;
  boundAt: string;
  bindingDigest: string;
}>;

export type CommitBindingField =
  | "operationId"
  | "sourceKey"
  | "occurredAt"
  | "journalTransactionId"
  | "journalTransactionDigest"
  | "operationSnapshotId"
  | "operationSnapshotDigest"
  | "unverifiedLimitPolicy"
  | "historyRecordDigest"
  | "previousLotStateDigest"
  | "nextLotStateDigest"
  | "previousWalletId"
  | "nextWalletId"
  | "astrologerUserId"
  | "currency"
  | "previousWalletRevision"
  | "nextWalletRevision"
  | "previousWalletSnapshotDigest"
  | "nextWalletSnapshotDigest";
