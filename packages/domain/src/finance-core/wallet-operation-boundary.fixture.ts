import {
  compareUnverifiedWalletOperation as compareWithBoundary,
  createUnverifiedWalletOperationComparisonSnapshot as createSnapshotWithBoundary,
  createWalletOperationCommitBindingRecord as createBindingWithBoundary,
  rehydrateUnverifiedWalletOperationComparisonSnapshot as rehydrateSnapshotWithBoundary,
  rehydrateUnverifiedWalletProjectionLimitPolicySnapshot as rehydratePolicyWithBoundary,
  rehydrateWalletOperationCommitBindingRecord as rehydrateBindingWithBoundary,
  type UnverifiedWalletOperationComparisonSnapshot,
  type UnverifiedWalletProjectionLimitPolicySnapshot
} from "./wallet-operation-projection";
import { walletProjectionDecoderEnvelope } from "./wallet-operation-base.fixture";

export const createUnverifiedWalletOperationComparisonSnapshot = (input: Record<string, unknown>) =>
  createSnapshotWithBoundary(
    input,
    walletProjectionDecoderEnvelope,
    input.unverifiedLimitPolicy as UnverifiedWalletProjectionLimitPolicySnapshot
  );

export const rehydrateUnverifiedWalletOperationComparisonSnapshot = (
  input: Record<string, unknown>
) =>
  rehydrateSnapshotWithBoundary(
    input,
    walletProjectionDecoderEnvelope,
    input.unverifiedLimitPolicy as UnverifiedWalletProjectionLimitPolicySnapshot
  );

export const createWalletOperationCommitBindingRecord = (input: Record<string, unknown>) => {
  const snapshot = input.operationSnapshot as UnverifiedWalletOperationComparisonSnapshot;
  return createBindingWithBoundary(
    input,
    walletProjectionDecoderEnvelope,
    snapshot.unverifiedLimitPolicy
  );
};

export const rehydrateWalletOperationCommitBindingRecord = (input: Record<string, unknown>) =>
  rehydrateBindingWithBoundary(
    input,
    walletProjectionDecoderEnvelope,
    input.unverifiedLimitPolicy as UnverifiedWalletProjectionLimitPolicySnapshot
  );

export const compareUnverifiedWalletOperation = (input: Record<string, unknown>) => {
  const snapshot = input.operationSnapshot as UnverifiedWalletOperationComparisonSnapshot;
  return compareWithBoundary(
    input,
    walletProjectionDecoderEnvelope,
    snapshot.unverifiedLimitPolicy
  );
};

export const rehydrateWalletProjectionLimitPolicy = (input: Record<string, unknown>) =>
  rehydratePolicyWithBoundary(input, walletProjectionDecoderEnvelope);

export function unverifiedWalletProjectionPolicyInput(): Record<string, unknown> {
  return {
    policyId: "wallet-projection-standard",
    version: "3",
    effectiveAt: "2026-08-01T00:00:00Z",
    maxEconomicEdgesPerOperation: "64",
    maxAuthorityRefsPerOperation: "16"
  };
}
