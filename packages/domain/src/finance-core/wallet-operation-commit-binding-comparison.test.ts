import { describe, expect, it } from "vitest";
import { createFinanceJournalTransaction } from "./journal";
import {
  compareUnverifiedWalletOperation,
  createUnverifiedWalletOperationComparisonSnapshot,
  createWalletOperationCommitBindingRecord
} from "./wallet-operation-boundary.fixture";
import {
  compareFixture,
  payoutFixture,
  payoutSnapshotInput,
  sha,
  wallet
} from "./wallet-operation-projection.fixture";

describe("unverified wallet-operation commit-binding comparison", () => {
  it("detects mixed-time wallet data through the unverified binding digest", () => {
    const baseline = payoutFixture();
    const mixedTimeNextWallet = wallet("8", {
      availableMinor: "500",
      payoutPendingMinor: "8140"
    });

    const result = compareUnverifiedWalletOperation({
      ...baseline,
      nextWallet: mixedTimeNextWallet
    });

    expect(result.discrepancies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "commit_binding_mismatch",
          field: "nextWalletSnapshotDigest"
        }),
        expect.objectContaining({
          kind: "wallet_balance_delta_mismatch",
          balance: "availableMinor"
        })
      ])
    );
  });

  it("keeps a caller-regenerated mixed-time binding internally consistent but explicitly unverified", () => {
    const baseline = payoutFixture();
    const previousWallet = wallet("7", { availableMinor: "8740" });
    const nextWallet = wallet("8", {
      availableMinor: "740",
      payoutPendingMinor: "8000"
    });
    const commitBinding = createWalletOperationCommitBindingRecord({
      schemaVersion: 1,
      bindingId: "regenerated-mixed-time-binding",
      operationSnapshot: baseline.operationSnapshot,
      journalTransaction: baseline.journalTransaction,
      previousWallet,
      nextWallet,
      boundAt: "2026-08-03T10:00:02Z"
    });

    const result = compareUnverifiedWalletOperation({
      operationSnapshot: baseline.operationSnapshot,
      journalTransaction: baseline.journalTransaction,
      previousWallet,
      nextWallet,
      commitBinding
    });

    expect(result).toEqual(
      expect.objectContaining({
        integrityStatus: "internally_consistent",
        authorizationStatus: "unverified",
        atomicityStatus: "unverified",
        discrepancies: []
      })
    );
  });

  it("detects journal and history drift against a prior binding", () => {
    const baseline = payoutFixture();
    const journalDrift = createFinanceJournalTransaction({
      id: baseline.journalTransaction.id,
      sourceKey: baseline.journalTransaction.sourceKey,
      occurredAt: baseline.journalTransaction.occurredAt,
      postedAt: "2026-08-03T10:00:01.5Z",
      reversesTransactionId: null,
      entries: baseline.journalTransaction.entries
    });
    const snapshotDrift = createUnverifiedWalletOperationComparisonSnapshot(
      payoutSnapshotInput({ historyRecordDigest: sha("d") })
    );

    const journalResult = compareUnverifiedWalletOperation({
      ...baseline,
      journalTransaction: journalDrift
    });
    const snapshotResult = compareUnverifiedWalletOperation({
      ...baseline,
      operationSnapshot: snapshotDrift
    });

    expect(journalResult.discrepancies).toContainEqual(
      expect.objectContaining({
        kind: "commit_binding_mismatch",
        field: "journalTransactionDigest"
      })
    );
    expect(snapshotResult.discrepancies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "commit_binding_mismatch",
          field: "operationSnapshotDigest"
        }),
        expect.objectContaining({
          kind: "commit_binding_mismatch",
          field: "historyRecordDigest"
        })
      ])
    );
  });

  it("reports a binding timestamp before its journal without claiming atomicity", () => {
    const result = compareFixture(payoutFixture({ boundAt: "2026-08-03T10:00:00.5Z" }));

    expect(result.discrepancies).toContainEqual({
      kind: "commit_binding_precedes_journal",
      boundAt: "2026-08-03T10:00:00.5Z",
      journalPostedAt: "2026-08-03T10:00:01Z"
    });
    expect(result.atomicityStatus).toBe("unverified");
  });
});
