import { Temporal } from "@js-temporal/polyfill";
import { serializeFinanceSourceKey } from "./finance-source-key";
import type { FinanceJournalTransaction } from "./journal";
import { deriveUnverifiedWalletOperationCommitBindingCore as deriveCommitBindingCore } from "./wallet-operation-commit-binding-codec";
import type {
  CommitBindingField,
  WalletOperationCommitBindingRecord
} from "./wallet-operation-commit-binding-types";
import type { WalletOperationProjectionDiscrepancy } from "./wallet-operation-comparison-types";
import { addWalletOperationDiscrepancy } from "./wallet-operation-discrepancy";
import type {
  UnverifiedWalletOperationComparisonSnapshot,
  UnverifiedWalletProjectionLimitPolicySnapshot,
  WalletProjectionDecoderEnvelope,
  WalletStoredSnapshot
} from "./wallet-operation-snapshot-types";

export function addCommitBindingDiscrepancies(
  commitBinding: WalletOperationCommitBindingRecord,
  operationSnapshot: UnverifiedWalletOperationComparisonSnapshot,
  journalTransaction: FinanceJournalTransaction,
  previousWallet: WalletStoredSnapshot,
  nextWallet: WalletStoredSnapshot,
  decoderEnvelope: WalletProjectionDecoderEnvelope,
  resolvedPolicy: UnverifiedWalletProjectionLimitPolicySnapshot,
  discrepancies: WalletOperationProjectionDiscrepancy[]
): void {
  const current = deriveCommitBindingCore(
    {
      bindingId: commitBinding.bindingId,
      operationSnapshot,
      journalTransaction,
      previousWallet,
      nextWallet,
      boundAt: commitBinding.boundAt
    },
    decoderEnvelope,
    resolvedPolicy
  );
  const bindings: readonly Readonly<{
    field: CommitBindingField;
    expected: string;
    actual: string;
  }>[] = [
    { field: "operationId", expected: current.operationId, actual: commitBinding.operationId },
    {
      field: "sourceKey",
      expected: serializeFinanceSourceKey(current.sourceKey),
      actual: serializeFinanceSourceKey(commitBinding.sourceKey)
    },
    { field: "occurredAt", expected: current.occurredAt, actual: commitBinding.occurredAt },
    {
      field: "journalTransactionId",
      expected: current.journalTransactionId,
      actual: commitBinding.journalTransactionId
    },
    {
      field: "journalTransactionDigest",
      expected: current.journalTransactionDigest,
      actual: commitBinding.journalTransactionDigest
    },
    {
      field: "operationSnapshotId",
      expected: current.operationSnapshotId,
      actual: commitBinding.operationSnapshotId
    },
    {
      field: "operationSnapshotDigest",
      expected: current.operationSnapshotDigest,
      actual: commitBinding.operationSnapshotDigest
    },
    {
      field: "unverifiedLimitPolicy",
      expected: JSON.stringify(current.unverifiedLimitPolicy),
      actual: JSON.stringify(commitBinding.unverifiedLimitPolicy)
    },
    {
      field: "historyRecordDigest",
      expected: current.historyRecordDigest,
      actual: commitBinding.historyRecordDigest
    },
    {
      field: "previousLotStateDigest",
      expected: current.previousLotStateDigest,
      actual: commitBinding.previousLotStateDigest
    },
    {
      field: "nextLotStateDigest",
      expected: current.nextLotStateDigest,
      actual: commitBinding.nextLotStateDigest
    },
    {
      field: "previousWalletId",
      expected: current.previousWalletId,
      actual: commitBinding.previousWalletId
    },
    {
      field: "nextWalletId",
      expected: current.nextWalletId,
      actual: commitBinding.nextWalletId
    },
    {
      field: "astrologerUserId",
      expected: current.astrologerUserId,
      actual: commitBinding.astrologerUserId
    },
    { field: "currency", expected: current.currency, actual: commitBinding.currency },
    {
      field: "previousWalletRevision",
      expected: current.previousWalletRevision,
      actual: commitBinding.previousWalletRevision
    },
    {
      field: "nextWalletRevision",
      expected: current.nextWalletRevision,
      actual: commitBinding.nextWalletRevision
    },
    {
      field: "previousWalletSnapshotDigest",
      expected: current.previousWalletSnapshotDigest,
      actual: commitBinding.previousWalletSnapshotDigest
    },
    {
      field: "nextWalletSnapshotDigest",
      expected: current.nextWalletSnapshotDigest,
      actual: commitBinding.nextWalletSnapshotDigest
    }
  ];
  for (const binding of bindings) {
    if (binding.expected !== binding.actual) {
      addWalletOperationDiscrepancy(discrepancies, {
        kind: "commit_binding_mismatch",
        field: binding.field,
        expected: binding.expected,
        actual: binding.actual
      });
    }
  }
  if (
    Temporal.Instant.compare(
      Temporal.Instant.from(commitBinding.boundAt),
      Temporal.Instant.from(journalTransaction.postedAt)
    ) < 0
  ) {
    addWalletOperationDiscrepancy(discrepancies, {
      kind: "commit_binding_precedes_journal",
      boundAt: commitBinding.boundAt,
      journalPostedAt: journalTransaction.postedAt
    });
  }
}
