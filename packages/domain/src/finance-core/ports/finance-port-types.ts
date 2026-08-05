import type { ProviderAccountIdentityBinding } from "../provider-account-binding";
import type { FinanceSourceKey } from "../finance-source-key";
import type { FinanceLedgerAccountRef } from "../ledger-chart";
import type { FinancePostingDecoderEnvelope } from "../postings/posting-decoder-envelope";
import type {
  UnverifiedWalletProjectionLimitPolicySnapshot,
  WalletProjectionDecoderEnvelope
} from "../wallet-operation-snapshot-types";

declare const resolvedFinanceOperationEnvelopeBrand: unique symbol;

/** Immutable provider identity used by every provider-scoped persistence boundary. */
export type FinanceProviderAccountIdentity = ProviderAccountIdentityBinding;

export type FinanceCurrency = "RUB";
export type FinanceDigest = `sha256:${string}`;
export type FinanceDecimal = string;

export type RawProviderArtifactRef = Readonly<{
  artifactId: string;
  sha256Digest: FinanceDigest;
  byteLength: number;
}>;

export type RawBankArtifactRef = Readonly<{
  artifactId: string;
  sha256Digest: FinanceDigest;
  byteLength: number;
  bankCashPoolId: string;
  statementSourceFingerprint: FinanceDigest;
}>;

export type BankEvidenceArtifactRef = Readonly<
  RawBankArtifactRef & {
    proofKind: "bank_rejection_document" | "bank_statement_no_debit";
    statementCheckpoint: string | null;
    bankReference: string | null;
  }
>;

/**
 * Wallet decoder limits and the effective policy are resolved out of band by the server-side
 * resource-policy owner. Their authority comes from the nominally branded enclosing operation
 * envelope, never from the untrusted wallet snapshot that repeats the same policy fields.
 */
export type ResolvedFinanceWalletProjectionPolicy = Readonly<{
  decoderEnvelope: WalletProjectionDecoderEnvelope;
  resolvedLimitPolicy: UnverifiedWalletProjectionLimitPolicySnapshot;
}>;

/**
 * Resolved outside the command payload from a versioned server-side resource policy.
 * The brand prevents a public caller from choosing its own online safety envelope.
 */
export type ResolvedFinanceOperationEnvelope = Readonly<{
  kind: "resolved_finance_operation_envelope";
  policyId: string;
  policyVersion: number;
  policyDigest: FinanceDigest;
  maximumRows: number;
  maximumDecimalDigits: number;
  maximumArtifactBytes: number;
  [resolvedFinanceOperationEnvelopeBrand]: true;
}>;

export type ResolvedFinanceJournalOperationEnvelope = Readonly<
  ResolvedFinanceOperationEnvelope & {
    journalPosting: Readonly<{
      decoderEnvelope: FinancePostingDecoderEnvelope;
    }>;
  }
>;

/** Capability-specific resolved envelope; unrelated provider/bank commands do not carry it. */
export type ResolvedFinanceWalletOperationEnvelope = Readonly<
  ResolvedFinanceOperationEnvelope & {
    walletProjection: ResolvedFinanceWalletProjectionPolicy;
  }
>;

export type NormalizedFinancePage<Row> = Readonly<{
  rows: readonly Row[];
  nextCursor: string | null;
  returnedCount: number;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type FinanceWalletHead = Readonly<{
  walletId: string;
  astrologerUserId: string;
  currency: FinanceCurrency;
  revision: FinanceDecimal;
  pendingMinor: FinanceDecimal;
  availableMinor: FinanceDecimal;
  reservedMinor: FinanceDecimal;
  payoutPendingMinor: FinanceDecimal;
  refundPendingMinor: FinanceDecimal;
  recoveryReceivableMinor: FinanceDecimal;
}>;

export type FinanceEconomicPaymentHead = Readonly<{
  economicPaymentIntentId: string;
  sourceId: string;
  purpose: "client_order" | "platform_invoice" | "platform_card_setup";
  providerAccount: FinanceProviderAccountIdentity;
  amountMinor: FinanceDecimal;
  currency: FinanceCurrency;
  state:
    | "created"
    | "checkout_opened"
    | "pending"
    | "pending_3ds"
    | "authorized"
    | "captured"
    | "declined"
    | "failed"
    | "expired"
    | "voided"
    | "timeout"
    | "provider_unknown";
  activeSessionId: string | null;
  capturedProviderPaymentId: string | null;
  version: number;
}>;

export type FinanceProviderPositionHead = Readonly<{
  providerAccount: FinanceProviderAccountIdentity;
  currency: FinanceCurrency;
  providerClearingMinor: FinanceDecimal;
  lastSettlementEntryId: string | null;
  revision: FinanceDecimal;
}>;

export type NormalizedFinanceJournalRow = Readonly<{
  journalTransactionId: string;
  entryIndex: number;
  sourceKey: FinanceSourceKey;
  serializedSourceKey: string;
  account: FinanceLedgerAccountRef;
  side: "debit" | "credit";
  amountMinor: FinanceDecimal;
  currency: FinanceCurrency;
  occurredAt: string;
}>;

export type NormalizedFinanceSourceLotRow = Readonly<{
  lotId: string;
  walletId: string;
  sourceId: string;
  parentLotId: string | null;
  bucket: "pending" | "available" | "reserved" | "payout_pending" | "refund_pending";
  amountMinor: FinanceDecimal;
  currency: FinanceCurrency;
  stateVersion: FinanceDecimal;
}>;
