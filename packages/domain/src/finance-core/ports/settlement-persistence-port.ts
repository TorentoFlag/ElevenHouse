import type {
  FinanceSettlementCursorKey,
  FinanceSettlementStream,
  LosslessSettlementEntry,
  LosslessSettlementPayout,
  ProviderSettlementEntryKey,
  SettlementPageCheckpointKey
} from "../settlement-cursor-types";
import type {
  FinanceDigest,
  FinanceProviderAccountIdentity,
  NormalizedFinancePage,
  RawProviderArtifactRef,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";
import type {
  VerifiedArcMerchantPayoutEvidence,
  VerifiedArcMerchantPayoutStatementEvidence,
  VerifiedSettlementPageEvidence
} from "./trusted-finance-evidence";

declare const settlementCursorLeaseReceiptBrand: unique symbol;
declare const verifiedSettlementPageBundleBrand: unique symbol;
declare const settlementBatchIngestionCommitReceiptRefBrand: unique symbol;
declare const settlementBatchIngestionCommitReceiptBrand: unique symbol;
declare const settlementPaymentCorrelationRuleBrand: unique symbol;
declare const settlementPaymentMatchCommitReceiptRefBrand: unique symbol;
declare const settlementPaymentMatchCommitReceiptBrand: unique symbol;
declare const merchantPayoutConfirmationCommitReceiptRefBrand: unique symbol;
declare const merchantPayoutConfirmationCommitReceiptBrand: unique symbol;
declare const merchantPayoutStatementIngestionCommitReceiptRefBrand: unique symbol;
declare const merchantPayoutStatementIngestionCommitReceiptBrand: unique symbol;
declare const merchantPayoutPaymentInclusionCommitReceiptRefBrand: unique symbol;

export type SettlementPageCheckpointIdentity = SettlementPageCheckpointKey;

export type ClaimSettlementCursorLeaseCommand = Readonly<{
  cursorKey: FinanceSettlementCursorKey;
  expectedCursorVersion: number;
  leaseOwnerId: string;
  leaseToken: string;
  leaseDurationSeconds: number;
}>;

export type RenewSettlementCursorLeaseCommand = Readonly<{
  cursorKey: FinanceSettlementCursorKey;
  expectedCursorVersion: number;
  leaseOwnerId: string;
  leaseToken: string;
  fencingToken: number;
  leaseDurationSeconds: number;
}>;

export type ReleaseSettlementCursorLeaseCommand = Readonly<{
  cursorKey: FinanceSettlementCursorKey;
  expectedCursorVersion: number;
  leaseOwnerId: string;
  leaseToken: string;
  fencingToken: number;
}>;

/** Lease timestamps and fencing token are issued from the database clock inside the UoW. */
export type SettlementCursorLeaseReceipt = Readonly<{
  kind: "settlement_cursor_lease_receipt";
  cursorKey: FinanceSettlementCursorKey;
  cursorVersion: number;
  leaseOwnerId: string;
  leaseToken: string;
  fencingToken: number;
  databaseClaimedAt: string;
  databaseExpiresAt: string;
  state: "active" | "released";
  [settlementCursorLeaseReceiptBrand]: true;
}>;

export type SettlementCursorLeaseUnitOfWork = Readonly<{
  claimLease(command: ClaimSettlementCursorLeaseCommand): Promise<SettlementCursorLeaseReceipt>;
  renewLease(command: RenewSettlementCursorLeaseCommand): Promise<SettlementCursorLeaseReceipt>;
  releaseLease(command: ReleaseSettlementCursorLeaseCommand): Promise<SettlementCursorLeaseReceipt>;
}>;

export type FetchSettlementPageCommand = Readonly<{
  cursorKey: FinanceSettlementCursorKey;
  checkpointIdentity: SettlementPageCheckpointIdentity;
  windowStart: string;
  windowEnd: string;
  lease: SettlementCursorLeaseReceipt & Readonly<{ state: "active" }>;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

/**
 * Decoder-issued, indivisible evidence bundle. Entries cannot be substituted independently from
 * the exact raw artifact, provider identity, stream, window generation or provider page cursor.
 */
type VerifiedSettlementPageBundleBase = Readonly<{
  kind: "verified_settlement_page_bundle";
  providerAccount: FinanceProviderAccountIdentity;
  checkpointIdentity: SettlementPageCheckpointIdentity;
  rawArtifact: RawProviderArtifactRef;
  decodedEntriesDigest: FinanceDigest;
  pageEvidence: VerifiedSettlementPageEvidence;
  verifiedAt: string;
  [verifiedSettlementPageBundleBrand]: true;
}>;

export type VerifiedSettlementPageBundle =
  | Readonly<
      VerifiedSettlementPageBundleBase & {
        stream: Extract<FinanceSettlementStream, "settlement_ledger">;
        normalizedEntries: NormalizedFinancePage<LosslessSettlementEntry>;
      }
    >
  | Readonly<
      VerifiedSettlementPageBundleBase & {
        stream: Extract<FinanceSettlementStream, "settlement_payouts">;
        normalizedEntries: NormalizedFinancePage<LosslessSettlementPayout>;
      }
    >;

/** Provider fetch and lossless decoding are completed before the ingestion transaction starts. */
export type SettlementProviderReadPort = Readonly<{
  transactionBoundary: "outside_database_transaction";
  fetchVerifiedPage(command: FetchSettlementPageCommand): Promise<VerifiedSettlementPageBundle>;
}>;

export type IngestVerifiedSettlementPageCommand = Readonly<{
  expectedCursorVersion: number;
  lease: SettlementCursorLeaseReceipt & Readonly<{ state: "active" }>;
  pageBundle: VerifiedSettlementPageBundle;
}>;

export type SettlementBatchIngestionCommitReceiptRef = Readonly<{
  kind: "settlement_batch_ingestion_commit_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: FinanceDigest;
  [settlementBatchIngestionCommitReceiptRefBrand]: true;
}>;

export type SettlementBatchIngestionCommitReceipt = Readonly<{
  ref: SettlementBatchIngestionCommitReceiptRef;
  providerAccount: FinanceProviderAccountIdentity;
  stream: FinanceSettlementStream;
  checkpointIdentity: SettlementPageCheckpointIdentity;
  rawArtifact: RawProviderArtifactRef;
  decodedEntriesDigest: FinanceDigest;
  insertedEntryCount: number;
  replayedEntryCount: number;
  cursorVersion: number;
  fencingToken: number;
  databaseCommittedAt: string;
  persistenceTransactionBoundaryRef: string;
  [settlementBatchIngestionCommitReceiptBrand]: true;
}>;

export type SettlementBatchIngestionUnitOfWork = Readonly<{
  ingestVerifiedPage(
    command: IngestVerifiedSettlementPageCommand
  ): Promise<SettlementBatchIngestionCommitReceipt>;
}>;

export type SettlementPaymentCorrelationRule = Readonly<{
  kind: "settlement_payment_correlation_rule";
  ruleId: string;
  ruleVersion: number;
  ruleDigest: FinanceDigest;
  providerAccount: FinanceProviderAccountIdentity;
  [settlementPaymentCorrelationRuleBrand]: true;
}>;

export type MatchSettlementPaymentCommand = Readonly<{
  providerEntryKey: ProviderSettlementEntryKey;
  economicPaymentIntentId: string;
  expectedClearingVersion: number;
  batchIngestion: SettlementBatchIngestionCommitReceiptRef;
  correlationRule: SettlementPaymentCorrelationRule;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type SettlementPaymentMatchCommitReceiptRef = Readonly<{
  kind: "settlement_payment_match_commit_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: FinanceDigest;
  [settlementPaymentMatchCommitReceiptRefBrand]: true;
}>;

export type SettlementPaymentMatchCommitReceipt = Readonly<{
  ref: SettlementPaymentMatchCommitReceiptRef;
  providerEntryKey: ProviderSettlementEntryKey;
  economicPaymentIntentId: string;
  matchResult: "matched" | "quarantined_no_effect";
  correlationRuleId: string;
  clearingVersion: number;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [settlementPaymentMatchCommitReceiptBrand]: true;
}>;

export type SettlementPaymentMatchUnitOfWork = Readonly<{
  matchSettlementPayment(
    command: MatchSettlementPaymentCommand
  ): Promise<SettlementPaymentMatchCommitReceipt>;
}>;

export type ConfirmMerchantPayoutCommand = Readonly<{
  bankCashPoolId: string;
  expectedProviderPositionRevision: string;
  statementIngestion: MerchantPayoutStatementIngestionCommitReceiptRef;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type MerchantPayoutConfirmationCommitReceiptRef = Readonly<{
  kind: "merchant_payout_confirmation_commit_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: FinanceDigest;
  [merchantPayoutConfirmationCommitReceiptRefBrand]: true;
}>;

export type MerchantPayoutConfirmationCommitReceipt = Readonly<{
  ref: MerchantPayoutConfirmationCommitReceiptRef;
  providerAccount: FinanceProviderAccountIdentity;
  bankCashPoolId: string;
  merchantPayoutId: string;
  providerBankPayoutId: string;
  bankReference: string;
  amountMinor: string;
  currency: "RUB";
  outcome: "completed";
  journalTransactionId: string;
  providerPositionRevision: string;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [merchantPayoutConfirmationCommitReceiptBrand]: true;
}>;

/**
 * Confirms the aggregate ArcPay merchant payout and moves its exact net amount from provider
 * clearing to Arc-to-bank clearing. Bank cash is still untouched until statement matching.
 */
export type MerchantPayoutConfirmationUnitOfWork = Readonly<{
  confirmMerchantPayout(
    command: ConfirmMerchantPayoutCommand
  ): Promise<MerchantPayoutConfirmationCommitReceipt>;
}>;

export type IngestVerifiedMerchantPayoutStatementCommand = Readonly<{
  batchIngestion: SettlementBatchIngestionCommitReceiptRef;
  payoutEvidence: VerifiedArcMerchantPayoutEvidence;
  statementEvidence: VerifiedArcMerchantPayoutStatementEvidence;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type MerchantPayoutStatementIngestionCommitReceiptRef = Readonly<{
  kind: "merchant_payout_statement_ingestion_commit_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: FinanceDigest;
  [merchantPayoutStatementIngestionCommitReceiptRefBrand]: true;
}>;

/** One immutable, database-issued authority for one payment line in one sealed payout statement. */
export type MerchantPayoutPaymentInclusionCommitReceiptRef = Readonly<{
  kind: "merchant_payout_payment_inclusion_commit_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: FinanceDigest;
  [merchantPayoutPaymentInclusionCommitReceiptRefBrand]: true;
}>;

export type MerchantPayoutStatementPaymentInclusionCommitReceipt = Readonly<{
  ref: MerchantPayoutPaymentInclusionCommitReceiptRef;
  providerPaymentId: string;
  externalId: string;
  lineNumber: number;
}>;

export type MerchantPayoutStatementIngestionCommitReceipt = Readonly<{
  ref: MerchantPayoutStatementIngestionCommitReceiptRef;
  providerAccount: FinanceProviderAccountIdentity;
  merchantPayoutId: string;
  providerBankPayoutId: string;
  bankReference: string;
  reportedNetPayoutMinor: string;
  currency: "RUB";
  outcome: "completed";
  statementArtifact: RawProviderArtifactRef;
  decodedPaymentLinesDigest: FinanceDigest;
  paymentInclusions: readonly MerchantPayoutStatementPaymentInclusionCommitReceipt[];
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [merchantPayoutStatementIngestionCommitReceiptBrand]: true;
}>;

/**
 * Seals the exact ArcPay statement header and all bounded, decoder-verified payment lines in one
 * transaction. A report above the resolved row/byte budget is rejected before locks are acquired;
 * it is never truncated or partially authoritative.
 */
export type MerchantPayoutStatementIngestionUnitOfWork = Readonly<{
  ingestVerifiedMerchantPayoutStatement(
    command: IngestVerifiedMerchantPayoutStatementCommand
  ): Promise<MerchantPayoutStatementIngestionCommitReceipt>;
}>;
