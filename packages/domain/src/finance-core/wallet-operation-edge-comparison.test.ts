import { describe, expect, it } from "vitest";
import { createFinanceLedgerAccountRef } from "./ledger-chart";
import { compareUnverifiedWalletOperation } from "./wallet-operation-boundary.fixture";
import {
  availableAccount,
  compareFixture,
  links,
  payoutFixture,
  payoutJournal,
  payoutPendingAccount,
  payoutSnapshotInput,
  wallet
} from "./wallet-operation-projection.fixture";

describe("bounded wallet-operation edge and scope comparison", () => {
  it("reports internal consistency without claiming authorization or atomic persistence", () => {
    const baseline = payoutFixture();
    const result = compareFixture(baseline);

    expect(result).toEqual(
      expect.objectContaining({
        integrityStatus: "internally_consistent",
        authorizationStatus: "unverified",
        atomicityStatus: "unverified"
      })
    );
    expect(result).not.toHaveProperty("status");
    expect(baseline.commitBinding).toEqual(
      expect.objectContaining({
        authorizationStatus: "unverified",
        atomicityStatus: "unverified",
        boundAt: "2026-08-03T10:00:02Z"
      })
    );
  });

  it("compares the exact payout move and does not invent turnover for a remainder lot", () => {
    const baseline = payoutFixture();
    const result = compareUnverifiedWalletOperation(baseline);

    expect(result).toEqual({
      integrityStatus: "internally_consistent",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified",
      operationId: "payout-request-1",
      astrologerUserId: "astrologer-1",
      currency: "RUB",
      previousWalletRevision: "7",
      nextWalletRevision: "8",
      expectedBalanceDeltas: {
        pendingMinor: "0",
        availableMinor: "-8000",
        reservedMinor: "0",
        payoutPendingMinor: "8000",
        refundPendingMinor: "0",
        recoveryReceivableMinor: "0"
      },
      discrepancies: []
    });
    expect(Object.isFrozen(baseline.operationSnapshot)).toBe(true);
    expect(Object.isFrozen(baseline.operationSnapshot.unverifiedLimitPolicy)).toBe(true);
    expect(Object.isFrozen(baseline.operationSnapshot.economicEdges)).toBe(true);
    expect(Object.isFrozen(baseline.operationSnapshot.economicEdges[0])).toBe(true);
    expect(Object.isFrozen(baseline.commitBinding)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.expectedBalanceDeltas)).toBe(true);
    expect(Object.isFrozen(result.discrepancies)).toBe(true);
  });

  it("returns duplicate snapshot identities as discrepancies instead of selecting one", () => {
    const baselineEdges = payoutSnapshotInput().economicEdges as readonly Record<string, unknown>[];
    const duplicateId = payoutFixture({
      snapshotInput: payoutSnapshotInput({
        economicEdges: [baselineEdges[0], { ...baselineEdges[1], edgeId: baselineEdges[0]?.edgeId }]
      })
    });
    const duplicateEconomicEdge = payoutFixture({
      snapshotInput: payoutSnapshotInput({
        economicEdges: [
          ...baselineEdges,
          { ...baselineEdges[0], edgeId: "payout-request-1-duplicate-economic-edge" }
        ]
      })
    });

    expect(compareFixture(duplicateId).discrepancies).toContainEqual({
      kind: "duplicate_snapshot_edge_id",
      edgeId: "payout-request-1-available-debit"
    });
    expect(compareFixture(duplicateEconomicEdge).discrepancies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "duplicate_snapshot_economic_edge",
          firstEdgeId: "payout-request-1-available-debit",
          duplicateEdgeId: "payout-request-1-duplicate-economic-edge"
        }),
        expect.objectContaining({ kind: "missing_journal_wallet_edge" })
      ])
    );
  });

  it.each([
    ["originalSaleId", "wrong-order"],
    ["componentId", "wrong-component"],
    ["payableLotId", "wrong-lot"],
    ["payoutAllocationId", "wrong-allocation"]
  ] as const)("detects exact %s link drift", (field, driftedValue) => {
    const driftedJournal = payoutJournal({
      entries: [
        {
          account: availableAccount,
          side: "debit",
          amount: { amountMinor: 8_000, currency: "RUB" },
          links: { ...links, [field]: driftedValue }
        },
        {
          account: payoutPendingAccount,
          side: "credit",
          amount: { amountMinor: 8_000, currency: "RUB" },
          links: { ...links, payableLotId: "lot-payout-request-1-pending" }
        }
      ]
    });
    const result = compareFixture(payoutFixture({ journal: driftedJournal }));

    expect(result.integrityStatus).toBe("discrepant");
    expect(result.discrepancies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "missing_journal_wallet_edge",
          edgeId: "payout-request-1-available-debit"
        }),
        expect.objectContaining({
          kind: "extra_journal_wallet_edge",
          transactionId: "journal-payout-request-1",
          entryIndex: 0
        })
      ])
    );
  });

  it("reports duplicate journal wallet edges without collapsing their amounts", () => {
    const duplicateJournal = payoutJournal({
      entries: [
        {
          account: availableAccount,
          side: "debit",
          amount: { amountMinor: 4_000, currency: "RUB" },
          links
        },
        {
          account: availableAccount,
          side: "debit",
          amount: { amountMinor: 4_000, currency: "RUB" },
          links
        },
        {
          account: payoutPendingAccount,
          side: "credit",
          amount: { amountMinor: 8_000, currency: "RUB" },
          links: { ...links, payableLotId: "lot-payout-request-1-pending" }
        }
      ]
    });

    expect(
      compareFixture(payoutFixture({ journal: duplicateJournal })).discrepancies
    ).toContainEqual(
      expect.objectContaining({
        kind: "duplicate_journal_wallet_edge",
        firstEntryIndex: 0,
        duplicateEntryIndex: 1
      })
    );
  });

  it("reports exact source-key and occurrence-time mismatches", () => {
    const wrongSource = compareFixture(
      payoutFixture({ journal: payoutJournal({ sourceId: "payout-request-other" }) })
    );
    const wrongTime = compareFixture(
      payoutFixture({ journal: payoutJournal({ occurredAt: "2026-08-03T09:59:59Z" }) })
    );

    expect(wrongSource.discrepancies).toContainEqual(
      expect.objectContaining({ kind: "journal_source_key_mismatch" })
    );
    expect(wrongTime.discrepancies).toContainEqual({
      kind: "journal_occurred_at_mismatch",
      expectedOccurredAt: "2026-08-03T10:00:00Z",
      actualOccurredAt: "2026-08-03T09:59:59Z"
    });
  });

  it.each([
    { name: "stale", previousRevision: "7", nextRevision: "7", reason: "stale" },
    { name: "skipped", previousRevision: "7", nextRevision: "9", reason: "skipped" }
  ] as const)("reports a $name stored-wallet revision", (example) => {
    const result = compareFixture(
      payoutFixture({
        snapshotInput: payoutSnapshotInput({
          previousWalletRevision: example.previousRevision,
          nextWalletRevision: example.nextRevision
        }),
        previousWallet: wallet(example.previousRevision, { availableMinor: "8640" }),
        nextWallet: wallet(example.nextRevision, {
          availableMinor: "640",
          payoutPendingMinor: "8000"
        })
      })
    );

    expect(result.discrepancies).toContainEqual({
      kind: "wallet_revision_transition_mismatch",
      previousRevision: example.previousRevision,
      nextRevision: example.nextRevision,
      reason: example.reason
    });
  });

  it("performs the wallet CAS increment with BigInt decimal revisions", () => {
    const previousRevision = "9007199254740993123456789";
    const nextRevision = "9007199254740993123456790";
    const result = compareFixture(
      payoutFixture({
        snapshotInput: payoutSnapshotInput({
          previousWalletRevision: previousRevision,
          nextWalletRevision: nextRevision
        }),
        previousWallet: wallet(previousRevision, { availableMinor: "8640" }),
        nextWallet: wallet(nextRevision, {
          availableMinor: "640",
          payoutPendingMinor: "8000"
        })
      })
    );

    expect(result.integrityStatus).toBe("internally_consistent");
    expect(result.previousWalletRevision).toBe(previousRevision);
    expect(result.nextWalletRevision).toBe(nextRevision);
  });

  it("reports operation-snapshot revision binding drift separately from the CAS step", () => {
    const result = compareFixture(
      payoutFixture({ snapshotInput: payoutSnapshotInput({ previousWalletRevision: "6" }) })
    );

    expect(result.discrepancies).toContainEqual({
      kind: "operation_wallet_revision_binding_mismatch",
      position: "previous",
      expectedRevision: "6",
      actualRevision: "7"
    });
  });

  it("reports wallet identity, wallet scope, and journal scope drift", () => {
    const foreignAvailable = createFinanceLedgerAccountRef({
      code: "astrologer_available",
      astrologerUserId: "astrologer-2",
      currency: "RUB"
    });
    const foreignPayoutPending = createFinanceLedgerAccountRef({
      code: "astrologer_payout_pending",
      astrologerUserId: "astrologer-2",
      currency: "RUB"
    });
    const foreignJournal = payoutJournal({
      entries: [
        {
          account: foreignAvailable,
          side: "debit",
          amount: { amountMinor: 8_000, currency: "RUB" },
          links
        },
        {
          account: foreignPayoutPending,
          side: "credit",
          amount: { amountMinor: 8_000, currency: "RUB" },
          links: { ...links, payableLotId: "lot-payout-request-1-pending" }
        }
      ]
    });
    const previousWallet = {
      ...wallet("7", { availableMinor: "8640" }),
      astrologerUserId: "astrologer-2"
    };
    const nextWallet = {
      ...wallet("8", { availableMinor: "640", payoutPendingMinor: "8000" }),
      walletId: "wallet-other"
    };
    const result = compareFixture(
      payoutFixture({ journal: foreignJournal, previousWallet, nextWallet })
    );

    expect(result.discrepancies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "wallet_identity_mismatch" }),
        expect.objectContaining({
          kind: "wallet_scope_mismatch",
          target: "previous_wallet",
          actualAstrologerUserId: "astrologer-2"
        }),
        expect.objectContaining({
          kind: "journal_wallet_scope_mismatch",
          transactionId: "journal-payout-request-1",
          entryIndex: 0,
          actualAstrologerUserId: "astrologer-2"
        })
      ])
    );
  });
});
