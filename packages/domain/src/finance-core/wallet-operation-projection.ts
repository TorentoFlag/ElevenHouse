import {
  addBalanceDeltaDiscrepancies,
  projectExpectedBalanceDeltas
} from "./wallet-operation-balance-comparison";
import { addCommitBindingDiscrepancies } from "./wallet-operation-commit-binding-comparison";
import { addEconomicEdgeDiscrepancies } from "./wallet-operation-edge-comparison";
import {
  hydrateWalletJournalTransaction as hydrateJournalTransaction,
  hydrateWalletStoredSnapshot as hydrateStoredWallet,
  normalizeWalletProjectionDecoderEnvelope,
  readWalletOperationExactDataRecord as exactDataRecord,
  rehydrateUnverifiedWalletOperationComparisonSnapshot,
  rehydrateUnverifiedWalletProjectionLimitPolicySnapshot,
  rehydrateWalletOperationCommitBindingRecord,
  walletOperationFail as fail,
  walletOperationIntegrityBoundary as integrityBoundary
} from "./wallet-operation-projection-codec";
import type {
  UnverifiedWalletOperationComparison,
  UnverifiedWalletProjectionLimitPolicySnapshot,
  WalletOperationProjectionDiscrepancy,
  WalletProjectionDecoderEnvelope
} from "./wallet-operation-projection-types";
import {
  addNegativeBalanceDiscrepancies,
  addScopeAndRevisionDiscrepancies
} from "./wallet-operation-scope-comparison";

export {
  createUnverifiedWalletOperationComparisonSnapshot,
  createUnverifiedWalletProjectionLimitPolicySnapshot,
  createWalletOperationCommitBindingRecord,
  rehydrateUnverifiedWalletOperationComparisonSnapshot,
  rehydrateUnverifiedWalletProjectionLimitPolicySnapshot,
  rehydrateWalletOperationCommitBindingRecord
} from "./wallet-operation-projection-codec";
export {
  toFinanceJournalLinkProofRef,
  toPayableLotOperationReceiptRef
} from "./wallet-operation-commit-proof-ref";
export {
  walletLotBalanceBucketValues,
  WalletOperationProjectionIntegrityError
} from "./wallet-operation-projection-types";
export type {
  FinanceJournalLinkProofRef,
  PayableLotOperationReceiptRef,
  UnverifiedWalletOperationComparison,
  UnverifiedWalletOperationComparisonSnapshot,
  UnverifiedWalletOperationComparisonSnapshotInput,
  UnverifiedWalletProjectionLimitPolicySnapshot,
  UnverifiedWalletProjectionLimitPolicySnapshotInput,
  VerifiedWalletOperationCommitReceipt,
  WalletBalanceSnapshot,
  WalletLotBalanceBucket,
  WalletLotEconomicEdge,
  WalletLotOperationAuthorityRef,
  WalletOperationCommitBindingRecord,
  WalletOperationProjectionDiscrepancy,
  WalletOperationProjectionIntegrityReason,
  WalletProjectionDecoderEnvelope,
  WalletStoredSnapshot
} from "./wallet-operation-projection-types";

const comparisonInputKeys = [
  "operationSnapshot",
  "journalTransaction",
  "previousWallet",
  "nextWallet",
  "commitBinding"
] as const;

export function compareUnverifiedWalletOperation(
  input: unknown,
  decoderEnvelope: WalletProjectionDecoderEnvelope,
  resolvedPolicy: UnverifiedWalletProjectionLimitPolicySnapshot
): UnverifiedWalletOperationComparison {
  return integrityBoundary(() => {
    const envelope = normalizeWalletProjectionDecoderEnvelope(decoderEnvelope);
    if (resolvedPolicy === undefined || resolvedPolicy === null) fail("resolved_policy_required");
    const policy = rehydrateUnverifiedWalletProjectionLimitPolicySnapshot(resolvedPolicy, envelope);
    const fields = exactDataRecord(input, comparisonInputKeys);
    const operationSnapshot = rehydrateUnverifiedWalletOperationComparisonSnapshot(
      fields.operationSnapshot,
      envelope,
      policy
    );
    const journalTransaction = hydrateJournalTransaction(fields.journalTransaction, envelope);
    const previousWallet = hydrateStoredWallet(fields.previousWallet, envelope);
    const nextWallet = hydrateStoredWallet(fields.nextWallet, envelope);
    const commitBinding = rehydrateWalletOperationCommitBindingRecord(
      fields.commitBinding,
      envelope,
      policy
    );
    const discrepancies: WalletOperationProjectionDiscrepancy[] = [];

    addScopeAndRevisionDiscrepancies(
      operationSnapshot,
      journalTransaction,
      previousWallet,
      nextWallet,
      discrepancies
    );
    addNegativeBalanceDiscrepancies(previousWallet, "previous", discrepancies);
    addNegativeBalanceDiscrepancies(nextWallet, "next", discrepancies);
    addEconomicEdgeDiscrepancies(operationSnapshot, journalTransaction, discrepancies);
    const expectedBalanceDeltas = projectExpectedBalanceDeltas(operationSnapshot.economicEdges);
    addBalanceDeltaDiscrepancies(previousWallet, nextWallet, expectedBalanceDeltas, discrepancies);
    addCommitBindingDiscrepancies(
      commitBinding,
      operationSnapshot,
      journalTransaction,
      previousWallet,
      nextWallet,
      envelope,
      policy,
      discrepancies
    );

    return Object.freeze({
      integrityStatus: discrepancies.length === 0 ? "internally_consistent" : "discrepant",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified",
      operationId: operationSnapshot.operationId,
      astrologerUserId: operationSnapshot.astrologerUserId,
      currency: "RUB",
      previousWalletRevision: previousWallet.revision,
      nextWalletRevision: nextWallet.revision,
      expectedBalanceDeltas,
      discrepancies: Object.freeze(discrepancies)
    });
  });
}
