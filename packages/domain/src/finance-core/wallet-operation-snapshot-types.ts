import type { Money } from "../money";
import type { FinanceSourceKey } from "./finance-source-key";
import type { FinanceJournalEntryLinks } from "./journal";
import type { FinanceLedgerSide } from "./ledger-chart";

export const walletLotBalanceBucketValues = Object.freeze([
  "pending",
  "available",
  "reserved",
  "payout_pending",
  "refund_pending",
  "recovery_receivable"
] as const);

export type WalletLotBalanceBucket = (typeof walletLotBalanceBucketValues)[number];

export type WalletLotEconomicEdge = Readonly<{
  edgeId: string;
  bucket: WalletLotBalanceBucket;
  side: FinanceLedgerSide;
  amount: Money;
  links: FinanceJournalEntryLinks;
}>;

/**
 * Trusted out-of-band object-decoder limits supplied by the composition root.
 * `maxInputBytes` is deliberately an adapter-before-parse precondition, not a
 * field here: an already parsed object cannot honestly prove how many bytes
 * produced it. The adapter must enforce an explicit byte limit before parsing.
 */
export type WalletProjectionDecoderEnvelope = Readonly<{
  maxEconomicEdges: number;
  maxAuthorityRefs: number;
  maxJournalEntries: number;
  maxDecimalDigits: number;
}>;

export type UnverifiedWalletProjectionLimitPolicySnapshotInput = Readonly<{
  policyId: string;
  version: string;
  effectiveAt: string;
  maxEconomicEdgesPerOperation: string;
  maxAuthorityRefsPerOperation: string;
}>;

export type UnverifiedWalletProjectionLimitPolicySnapshot =
  UnverifiedWalletProjectionLimitPolicySnapshotInput & Readonly<{ canonicalDigest: string }>;

export type WalletLotOperationAuthorityRef = Readonly<{
  kind: string;
  authorityId: string;
  version: string;
  canonicalDigest: string;
}>;

export type UnverifiedWalletOperationComparisonSnapshotInput = Readonly<{
  schemaVersion: 1;
  authorizationStatus: "unverified";
  snapshotId: string;
  operationId: string;
  sourceKey: FinanceSourceKey;
  occurredAt: string;
  astrologerUserId: string;
  currency: "RUB";
  unverifiedLimitPolicy: UnverifiedWalletProjectionLimitPolicySnapshot;
  previousLotStateDigest: string;
  nextLotStateDigest: string;
  historyRecordDigest: string;
  previousWalletRevision: string;
  nextWalletRevision: string;
  authorityRefs: readonly WalletLotOperationAuthorityRef[];
  economicEdges: readonly WalletLotEconomicEdge[];
}>;

export type UnverifiedWalletOperationComparisonSnapshot =
  UnverifiedWalletOperationComparisonSnapshotInput & Readonly<{ snapshotDigest: string }>;

export type WalletBalanceSnapshot = Readonly<{
  pendingMinor: string;
  availableMinor: string;
  reservedMinor: string;
  payoutPendingMinor: string;
  refundPendingMinor: string;
  recoveryReceivableMinor: string;
}>;

export type WalletStoredSnapshot = Readonly<{
  walletId: string;
  revision: string;
  astrologerUserId: string;
  currency: "RUB";
  balances: WalletBalanceSnapshot;
}>;
