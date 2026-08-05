import { describe, expect, it } from "vitest";
import { createFinanceSourceKey } from "./finance-source-key";
import { createFinanceJournalTransaction } from "./journal";
import { createFinanceLedgerAccountRef } from "./ledger-chart";
import {
  compareUnverifiedWalletOperation,
  createUnverifiedWalletOperationComparisonSnapshot,
  createWalletOperationCommitBindingRecord
} from "./wallet-operation-boundary.fixture";
import {
  availableAccount,
  balances,
  compareFixture,
  links,
  outboundAccount,
  payoutFixture,
  payoutJournal,
  payoutPendingAccount,
  payoutSnapshotInput,
  wallet
} from "./wallet-operation-projection.fixture";

describe("bounded wallet-operation balance comparison", () => {
  it("computes stored balance deltas with BigInt strings beyond Number safe range", () => {
    const result = compareFixture(
      payoutFixture({
        previousWallet: wallet("7", { availableMinor: "9007199254740993123456789" }),
        nextWallet: wallet("8", {
          availableMinor: "9007199254740993123448789",
          payoutPendingMinor: "8000"
        })
      })
    );

    expect(result.integrityStatus).toBe("internally_consistent");
    expect(result.expectedBalanceDeltas.availableMinor).toBe("-8000");
  });

  it("sums several individually safe economic edges beyond Number.MAX_SAFE_INTEGER", () => {
    const amountMinor = Number.MAX_SAFE_INTEGER;
    const totalMinor = (BigInt(amountMinor) * 2n).toString();
    const firstLinks = { ...links, componentId: "large-component-1" };
    const secondLinks = { ...links, componentId: "large-component-2" };
    const journalTransaction = payoutJournal({
      entries: [
        {
          account: availableAccount,
          side: "debit",
          amount: { amountMinor, currency: "RUB" },
          links: firstLinks
        },
        {
          account: availableAccount,
          side: "debit",
          amount: { amountMinor, currency: "RUB" },
          links: secondLinks
        },
        {
          account: outboundAccount,
          side: "credit",
          amount: { amountMinor, currency: "RUB" },
          links: firstLinks
        },
        {
          account: outboundAccount,
          side: "credit",
          amount: { amountMinor, currency: "RUB" },
          links: secondLinks
        }
      ]
    });
    const operationSnapshot = createUnverifiedWalletOperationComparisonSnapshot(
      payoutSnapshotInput({
        economicEdges: [
          {
            edgeId: "large-edge-1",
            bucket: "available",
            side: "debit",
            amount: { amountMinor, currency: "RUB" },
            links: firstLinks
          },
          {
            edgeId: "large-edge-2",
            bucket: "available",
            side: "debit",
            amount: { amountMinor, currency: "RUB" },
            links: secondLinks
          }
        ]
      })
    );
    const previousWallet = wallet("7", { availableMinor: totalMinor });
    const nextWallet = wallet("8", { availableMinor: "0" });
    const commitBinding = createWalletOperationCommitBindingRecord({
      schemaVersion: 1,
      bindingId: "large-edge-binding",
      operationSnapshot,
      journalTransaction,
      previousWallet,
      nextWallet,
      boundAt: "2026-08-03T10:00:02Z"
    });

    const result = compareUnverifiedWalletOperation({
      operationSnapshot,
      journalTransaction,
      previousWallet,
      nextWallet,
      commitBinding
    });

    expect(result.integrityStatus).toBe("internally_consistent");
    expect(result.expectedBalanceDeltas.availableMinor).toBe(`-${totalMinor}`);
  });

  it("accepts a factual paid move without inventing a generic later-dispute gate", () => {
    const sourceKey = createFinanceSourceKey({
      kind: "payout",
      sourceId: "payout-request-paid-1",
      operation: "paid"
    });
    const paidLinks = { ...links, payableLotId: "lot-payout-request-1-pending" };
    const journalTransaction = createFinanceJournalTransaction({
      id: "journal-payout-paid-1",
      sourceKey,
      occurredAt: "2026-08-03T11:00:00Z",
      postedAt: "2026-08-03T11:00:01Z",
      reversesTransactionId: null,
      entries: [
        {
          account: payoutPendingAccount,
          side: "debit",
          amount: { amountMinor: 8_000, currency: "RUB" },
          links: paidLinks
        },
        {
          account: outboundAccount,
          side: "credit",
          amount: { amountMinor: 8_000, currency: "RUB" },
          links: paidLinks
        }
      ]
    });
    const operationSnapshot = createUnverifiedWalletOperationComparisonSnapshot({
      ...payoutSnapshotInput(),
      snapshotId: "wallet-lot-operation-payout-paid-1",
      operationId: "payout-paid-1",
      sourceKey,
      occurredAt: "2026-08-03T11:00:00Z",
      previousWalletRevision: "10",
      nextWalletRevision: "11",
      economicEdges: [
        {
          edgeId: "payout-paid-1-pending-debit",
          bucket: "payout_pending",
          side: "debit",
          amount: { amountMinor: 8_000, currency: "RUB" },
          links: paidLinks
        }
      ]
    });
    const previousWallet = wallet("10", { payoutPendingMinor: "8000" });
    const nextWallet = wallet("11", {});
    const commitBinding = createWalletOperationCommitBindingRecord({
      schemaVersion: 1,
      bindingId: "wallet-binding-payout-paid-1",
      operationSnapshot,
      journalTransaction,
      previousWallet,
      nextWallet,
      boundAt: "2026-08-03T11:00:02Z"
    });

    expect(
      compareUnverifiedWalletOperation({
        operationSnapshot,
        journalTransaction,
        previousWallet,
        nextWallet,
        commitBinding
      }).integrityStatus
    ).toBe("internally_consistent");
  });

  it("accepts no wallet edge while still comparing one wallet revision", () => {
    const sourceKey = createFinanceSourceKey({
      kind: "chargeback",
      sourceId: "chargeback-confirmation-1",
      operation: "confirmed"
    });
    const suspenseAccount = createFinanceLedgerAccountRef({
      code: "chargeback_principal_suspense",
      arcProviderAccountId: "arc-account-live",
      currency: "RUB"
    });
    const providerAccount = createFinanceLedgerAccountRef({
      code: "arc_provider_clearing",
      arcProviderAccountId: "arc-account-live",
      currency: "RUB"
    });
    const noLinks = {
      originalSaleId: "order-1",
      componentId: "chargeback-principal-1",
      payableLotId: null,
      payoutAllocationId: null
    };
    const journalTransaction = createFinanceJournalTransaction({
      id: "journal-chargeback-confirmed-1",
      sourceKey,
      occurredAt: "2026-08-03T12:00:00Z",
      postedAt: "2026-08-03T12:00:01Z",
      reversesTransactionId: null,
      entries: [
        {
          account: suspenseAccount,
          side: "debit",
          amount: { amountMinor: 1_000, currency: "RUB" },
          links: noLinks
        },
        {
          account: providerAccount,
          side: "credit",
          amount: { amountMinor: 1_000, currency: "RUB" },
          links: noLinks
        }
      ]
    });
    const operationSnapshot = createUnverifiedWalletOperationComparisonSnapshot({
      ...payoutSnapshotInput(),
      snapshotId: "wallet-lot-operation-chargeback-confirmed-1",
      operationId: "chargeback-confirmed-1",
      sourceKey,
      occurredAt: "2026-08-03T12:00:00Z",
      previousWalletRevision: "20",
      nextWalletRevision: "21",
      economicEdges: []
    });
    const previousWallet = wallet("20", { availableMinor: "8640" });
    const nextWallet = wallet("21", { availableMinor: "8640" });
    const commitBinding = createWalletOperationCommitBindingRecord({
      schemaVersion: 1,
      bindingId: "wallet-binding-chargeback-confirmed-1",
      operationSnapshot,
      journalTransaction,
      previousWallet,
      nextWallet,
      boundAt: "2026-08-03T12:00:02Z"
    });

    expect(
      compareUnverifiedWalletOperation({
        operationSnapshot,
        journalTransaction,
        previousWallet,
        nextWallet,
        commitBinding
      })
    ).toEqual(
      expect.objectContaining({
        integrityStatus: "internally_consistent",
        authorizationStatus: "unverified",
        atomicityStatus: "unverified",
        expectedBalanceDeltas: balances()
      })
    );
  });

  it("reports a negative stored balance and never clamps it", () => {
    const result = compareFixture(
      payoutFixture({
        previousWallet: wallet("7", { availableMinor: "10" }),
        nextWallet: wallet("8", {
          availableMinor: "-7990",
          payoutPendingMinor: "8000"
        })
      })
    );

    expect(result.discrepancies).toContainEqual({
      kind: "negative_wallet_balance",
      position: "next",
      balance: "availableMinor",
      amountMinor: "-7990"
    });
  });

  it("freezes discrepancies and never proposes a corrected wallet", () => {
    const result = compareUnverifiedWalletOperation({
      ...payoutFixture(),
      nextWallet: wallet("8", { availableMinor: "639", payoutPendingMinor: "8000" })
    });

    expect(result.integrityStatus).toBe("discrepant");
    expect(result).not.toHaveProperty("correctedWallet");
    expect(result).not.toHaveProperty("nextWallet");
    expect(result.discrepancies.length).toBeGreaterThan(0);
    expect(result.discrepancies.every((discrepancy) => Object.isFrozen(discrepancy))).toBe(true);
  });
});
