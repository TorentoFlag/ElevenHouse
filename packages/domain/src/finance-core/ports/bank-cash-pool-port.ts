import type { OnlineWalletPayoutPaidReceiptRef } from "./online-wallet-payout-execution-uow";
import type { MerchantPayoutConfirmationCommitReceiptRef } from "./settlement-persistence-port";
import type {
  FinanceCurrency,
  FinanceDigest,
  RawBankArtifactRef,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";
import type { FinanceTransactionAuthorizationProof } from "../../finance-authorization";
import type { BankLiquiditySnapshotAttestationInput } from "../bank-liquidity-snapshot-attestation";
import type {
  BankLiquiditySnapshotAttestationReceiptRef,
  VerifiedBankLiquiditySnapshotEvidence,
  VerifiedBankStatementEvidence
} from "./trusted-finance-evidence";

declare const emptyCashPoolDirectoryReceiptBrand: unique symbol;
declare const bankLiquiditySnapshotAdoptionReceiptRefBrand: unique symbol;
declare const bankLiquiditySnapshotAdoptionReceiptBrand: unique symbol;
declare const bankStatementIngestionCommitReceiptRefBrand: unique symbol;
declare const bankStatementIngestionCommitReceiptBrand: unique symbol;
declare const bankStatementClassificationRuleBrand: unique symbol;
declare const bankCashMatchCommitReceiptRefBrand: unique symbol;
declare const bankCashMatchCommitReceiptBrand: unique symbol;

export type EnsureEmptySystemCashPoolReferenceCommand = Readonly<{
  bankCashPoolId: string;
  currency: FinanceCurrency;
  bankAccountFingerprint: FinanceDigest;
  statementSourceFingerprint: FinanceDigest;
}>;

/** Reference-only system seed: no balance-bearing row and no journal entry are created. */
export type EmptyCashPoolDirectoryReceipt = Readonly<{
  kind: "empty_cash_pool_directory_receipt";
  bankCashPoolId: string;
  currency: FinanceCurrency;
  monetaryInitialization: "reference_only_zero";
  balanceBearingRowsCreated: 0;
  journalTransactionId: null;
  persistenceTransactionBoundaryRef: string;
  [emptyCashPoolDirectoryReceiptBrand]: true;
}>;

export type CashPoolDirectoryBootstrapPort = Readonly<{
  ensureEmptySystemCashPoolReference(
    command: EnsureEmptySystemCashPoolReferenceCommand
  ): Promise<EmptyCashPoolDirectoryReceipt>;
}>;

/**
 * Server-resolved identity used when an internal operator seals bank evidence.
 * The browser must never choose a cash pool or statement source fingerprint.
 */
export type ActiveBankEvidenceCashPool = Readonly<{
  bankCashPoolId: string;
  currency: FinanceCurrency;
  statementSourceFingerprint: FinanceDigest;
}>;

export type BankEvidenceCashPoolReader = Readonly<{
  findActiveBankEvidenceCashPool(input: ActiveBankEvidenceCashPool): Promise<ActiveBankEvidenceCashPool | null>;
}>;

export type AdoptVerifiedBankLiquiditySnapshotCommand = Readonly<{
  bankCashPoolId: string;
  currency: FinanceCurrency;
  expectedBankLiquidityRevision: string;
  evidence: VerifiedBankLiquiditySnapshotEvidence;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type BankLiquiditySnapshotAdoptionReceiptRef = Readonly<{
  kind: "bank_liquidity_snapshot_adoption_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: FinanceDigest;
  [bankLiquiditySnapshotAdoptionReceiptRefBrand]: true;
}>;

export type BankLiquiditySnapshotAdoptionReceipt = Readonly<{
  ref: BankLiquiditySnapshotAdoptionReceiptRef;
  bankCashPoolId: string;
  currency: FinanceCurrency;
  bankLiquidityRevision: string;
  sourceCheckpoint: string;
  databaseAdoptedAt: string;
  persistenceTransactionBoundaryRef: string;
  [bankLiquiditySnapshotAdoptionReceiptBrand]: true;
}>;

export type BankLiquiditySnapshotAdoptionUnitOfWork = Readonly<{
  adoptVerifiedLiquiditySnapshot(
    command: AdoptVerifiedBankLiquiditySnapshotCommand
  ): Promise<BankLiquiditySnapshotAdoptionReceipt>;
}>;

export type AttestBankLiquiditySnapshotCommand = Readonly<
  BankLiquiditySnapshotAttestationInput & {
    authorization: FinanceTransactionAuthorizationProof;
  }
>;

export type BankLiquiditySnapshotAttestationCommitReceipt = Readonly<{
  ref: BankLiquiditySnapshotAttestationReceiptRef;
  bankCashPoolId: string;
  currency: FinanceCurrency;
  expectedBankLiquidityRevision: string;
  evidence: VerifiedBankLiquiditySnapshotEvidence;
  attestedAt: string;
}>;

export type BankLiquiditySnapshotAttestationUnitOfWork = Readonly<{
  attestBankLiquiditySnapshot(
    command: AttestBankLiquiditySnapshotCommand
  ): Promise<BankLiquiditySnapshotAttestationCommitReceipt>;
}>;

/**
 * Server-side reader for the only snapshot that can authorize a new payout commitment.
 * It deliberately returns `null` for stale, superseded or incomplete state; callers must never
 * select a historical receipt from an admin browser.
 */
export type CurrentEligibleBankLiquiditySnapshot = Readonly<{
  bankCashPoolId: string;
  currency: FinanceCurrency;
  bankLiquidityRevision: string;
  adoptedSnapshot: BankLiquiditySnapshotAdoptionReceiptRef;
  sourceCheckpoint: string;
  expiresAt: string;
  availableLiquidityMinor: string;
}>;

export type CurrentEligibleBankLiquiditySnapshotReader = Readonly<{
  findCurrentEligibleBankLiquiditySnapshot(input: Readonly<{
    bankCashPoolId: string;
    currency: FinanceCurrency;
  }>): Promise<CurrentEligibleBankLiquiditySnapshot | null>;
}>;

export type IngestVerifiedBankStatementEntryCommand = Readonly<{
  bankCashPoolId: string;
  expectedStatementImportVersion: string;
  evidence: VerifiedBankStatementEvidence;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type BankStatementIngestionCommitReceiptRef = Readonly<{
  kind: "bank_statement_ingestion_commit_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: FinanceDigest;
  [bankStatementIngestionCommitReceiptRefBrand]: true;
}>;

/** Ingestion seals immutable evidence only; bank_cash changes later in BankCashMatchUnitOfWork. */
export type BankStatementIngestionCommitReceipt = Readonly<{
  ref: BankStatementIngestionCommitReceiptRef;
  bankCashPoolId: string;
  bankStatementEntryId: string;
  sourceStatementId: string;
  sourceCheckpoint: string;
  sourceRowId: string;
  artifact: RawBankArtifactRef;
  statementImportVersion: string;
  dedupeResult: "inserted" | "replay";
  journalTransactionId: null;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [bankStatementIngestionCommitReceiptBrand]: true;
}>;

export type BankStatementIngestionUnitOfWork = Readonly<{
  ingestVerifiedStatementEntry(
    command: IngestVerifiedBankStatementEntryCommand
  ): Promise<BankStatementIngestionCommitReceipt>;
}>;

export type BankStatementClassificationRule = Readonly<{
  kind: "bank_statement_classification_rule";
  ruleId: string;
  ruleVersion: number;
  ruleDigest: FinanceDigest;
  [bankStatementClassificationRuleBrand]: true;
}>;

export type BankCashMatchAuthority =
  | Readonly<{
      kind: "merchant_settlement";
      merchantPayout: MerchantPayoutConfirmationCommitReceiptRef;
    }>
  | Readonly<{
      kind: "manual_payout";
      /** New client money and manual payout lifecycle are canonical V2 only. */
      payoutPaid: OnlineWalletPayoutPaidReceiptRef;
    }>
  | Readonly<{
      kind: "unmatched_to_suspense";
      classificationRule: BankStatementClassificationRule;
    }>;

export type MatchBankCashCommand = Readonly<{
  bankCashPoolId: string;
  currency: FinanceCurrency;
  expectedBankLiquidityRevision: string;
  statementIngestion: BankStatementIngestionCommitReceiptRef;
  matchAuthority: BankCashMatchAuthority;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type BankCashMatchCommitReceiptRef = Readonly<{
  kind: "bank_cash_match_commit_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: FinanceDigest;
  [bankCashMatchCommitReceiptRefBrand]: true;
}>;

export type BankCashMatchCommitReceipt = Readonly<{
  ref: BankCashMatchCommitReceiptRef;
  bankCashPoolId: string;
  bankStatementEntryId: string;
  matchResult: "merchant_settlement" | "manual_payout" | "unmatched_debit" | "unmatched_credit";
  journalTransactionId: string;
  bankLiquidityRevision: string;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [bankCashMatchCommitReceiptBrand]: true;
}>;

export type BankCashMatchUnitOfWork = Readonly<{
  matchBankCash(command: MatchBankCashCommand): Promise<BankCashMatchCommitReceipt>;
}>;
