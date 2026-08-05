import type {
  FinanceDigest,
  FinanceEconomicPaymentHead,
  FinanceProviderAccountIdentity,
  FinanceProviderPositionHead,
  FinanceWalletHead,
  NormalizedFinanceJournalRow,
  NormalizedFinancePage,
  NormalizedFinanceSourceLotRow,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";

declare const verifiedBoundedReconciliationResultBrand: unique symbol;
declare const financeReconciliationCommitReceiptBrand: unique symbol;

export type FinanceOnlineReconciliationReadPort = Readonly<{
  readWalletHead(
    input: Readonly<{
      walletId: string;
    }>
  ): Promise<FinanceWalletHead | null>;
  readEconomicPaymentHead(
    input: Readonly<{
      economicPaymentIntentId: string;
    }>
  ): Promise<FinanceEconomicPaymentHead | null>;
  readProviderPositionHead(
    input: Readonly<{
      providerAccount: FinanceProviderAccountIdentity;
      currency: "RUB";
    }>
  ): Promise<FinanceProviderPositionHead | null>;
  readNormalizedJournalPage(
    input: Readonly<{
      walletId: string;
      afterRowId: string | null;
      operationEnvelope: ResolvedFinanceOperationEnvelope;
    }>
  ): Promise<NormalizedFinancePage<NormalizedFinanceJournalRow>>;
  readNormalizedSourceLotPage(
    input: Readonly<{
      walletId: string;
      afterRowId: string | null;
      operationEnvelope: ResolvedFinanceOperationEnvelope;
    }>
  ): Promise<NormalizedFinancePage<NormalizedFinanceSourceLotRow>>;
}>;

export type NormalizedFinanceHistoryRecord =
  | Readonly<{ kind: "journal"; row: NormalizedFinanceJournalRow }>
  | Readonly<{ kind: "source_lot"; row: NormalizedFinanceSourceLotRow }>
  | Readonly<{ kind: "wallet_head"; row: FinanceWalletHead }>
  | Readonly<{ kind: "economic_payment_head"; row: FinanceEconomicPaymentHead }>
  | Readonly<{ kind: "provider_position_head"; row: FinanceProviderPositionHead }>;

/** Full lifetime reconstruction is intentionally isolated from every online request-path port. */
export type FinanceFullHistoryReconstructionPort = Readonly<{
  executionMode: "offline_reconciliation_only";
  streamNormalizedHistory(
    input: Readonly<{
      subjectKind: "wallet" | "economic_payment" | "provider_position" | "bank_cash_pool";
      subjectId: string;
      checkpoint: string | null;
      operationEnvelope: ResolvedFinanceOperationEnvelope;
    }>
  ): AsyncIterable<NormalizedFinanceHistoryRecord>;
}>;

export type VerifiedBoundedReconciliationResult = Readonly<{
  kind: "verified_bounded_reconciliation_result";
  reconciliationRunId: string;
  subjectKind: "wallet" | "economic_payment" | "provider_position" | "bank_cash_pool";
  subjectId: string;
  reconstructedHeadDigest: FinanceDigest;
  persistedHeadDigest: FinanceDigest;
  comparedThroughCheckpoint: string;
  outcome: "matched" | "discrepancy";
  discrepancyDigest: FinanceDigest | null;
  [verifiedBoundedReconciliationResultBrand]: true;
}>;

export type CommitBoundedReconciliationResultCommand = Readonly<{
  expectedReconciliationCheckpointVersion: string;
  result: VerifiedBoundedReconciliationResult;
}>;

export type FinanceReconciliationCommitReceipt = Readonly<{
  kind: "finance_reconciliation_commit_receipt";
  reconciliationRunId: string;
  reconciliationCheckpointVersion: string;
  outcome: "matched" | "discrepancy";
  exceptionId: string | null;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [financeReconciliationCommitReceiptBrand]: true;
}>;

export type FinanceReconciliationUnitOfWork = Readonly<{
  commitBoundedReconciliationResult(
    command: CommitBoundedReconciliationResultCommand
  ): Promise<FinanceReconciliationCommitReceipt>;
}>;
