import type { CommitBindingField } from "./wallet-operation-commit-binding-types";
import type { WalletBalanceSnapshot } from "./wallet-operation-snapshot-types";

export type WalletOperationProjectionDiscrepancy =
  | Readonly<{
      kind: "duplicate_snapshot_edge_id";
      edgeId: string;
    }>
  | Readonly<{
      kind: "duplicate_snapshot_economic_edge";
      edgeKey: string;
      firstEdgeId: string;
      duplicateEdgeId: string;
    }>
  | Readonly<{
      kind: "duplicate_journal_wallet_edge";
      edgeKey: string;
      firstEntryIndex: number;
      duplicateEntryIndex: number;
    }>
  | Readonly<{
      kind: "missing_journal_wallet_edge";
      edgeId: string;
      edgeKey: string;
    }>
  | Readonly<{
      kind: "extra_journal_wallet_edge";
      transactionId: string;
      entryIndex: number;
      edgeKey: string;
    }>
  | Readonly<{
      kind: "journal_source_key_mismatch";
      expectedSourceKey: string;
      actualSourceKey: string;
    }>
  | Readonly<{
      kind: "journal_occurred_at_mismatch";
      expectedOccurredAt: string;
      actualOccurredAt: string;
    }>
  | Readonly<{
      kind: "journal_wallet_scope_mismatch";
      transactionId: string;
      entryIndex: number;
      expectedAstrologerUserId: string;
      actualAstrologerUserId: string;
    }>
  | Readonly<{
      kind: "wallet_scope_mismatch";
      target: "previous_wallet" | "next_wallet";
      expectedAstrologerUserId: string;
      actualAstrologerUserId: string;
    }>
  | Readonly<{
      kind: "wallet_identity_mismatch";
      previousWalletId: string;
      nextWalletId: string;
    }>
  | Readonly<{
      kind: "wallet_revision_transition_mismatch";
      previousRevision: string;
      nextRevision: string;
      reason: "stale" | "skipped";
    }>
  | Readonly<{
      kind: "operation_wallet_revision_binding_mismatch";
      position: "previous" | "next";
      expectedRevision: string;
      actualRevision: string;
    }>
  | Readonly<{
      kind: "wallet_balance_delta_mismatch";
      balance: keyof WalletBalanceSnapshot;
      previousMinor: string;
      nextMinor: string;
      expectedDeltaMinor: string;
      actualDeltaMinor: string;
    }>
  | Readonly<{
      kind: "negative_wallet_balance";
      position: "previous" | "next";
      balance: keyof WalletBalanceSnapshot;
      amountMinor: string;
    }>
  | Readonly<{
      kind: "commit_binding_mismatch";
      field: CommitBindingField;
      expected: string;
      actual: string;
    }>
  | Readonly<{
      kind: "commit_binding_precedes_journal";
      boundAt: string;
      journalPostedAt: string;
    }>;

export type UnverifiedWalletOperationComparison = Readonly<{
  integrityStatus: "internally_consistent" | "discrepant";
  authorizationStatus: "unverified";
  atomicityStatus: "unverified";
  operationId: string;
  astrologerUserId: string;
  currency: "RUB";
  previousWalletRevision: string;
  nextWalletRevision: string;
  expectedBalanceDeltas: WalletBalanceSnapshot;
  discrepancies: readonly WalletOperationProjectionDiscrepancy[];
}>;

export type WalletOperationProjectionIntegrityReason =
  | "invalid_shape"
  | "invalid_field"
  | "unsupported_schema_version"
  | "digest_mismatch"
  | "limit_policy_exceeded"
  | "decoder_envelope_required"
  | "decoder_envelope_exceeded"
  | "resolved_policy_required"
  | "resolved_policy_mismatch"
  | "policy_not_effective";

export class WalletOperationProjectionIntegrityError extends Error {
  readonly code = "wallet_operation_projection_integrity_violation";

  constructor(readonly reason: WalletOperationProjectionIntegrityReason) {
    super("Wallet operation comparison input violates persistence invariants");
    this.name = "WalletOperationProjectionIntegrityError";
  }
}
