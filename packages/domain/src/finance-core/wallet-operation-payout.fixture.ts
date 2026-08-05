import { createFinanceSourceKey } from "./finance-source-key";
import { createFinanceJournalTransaction } from "./journal";
import {
  compareUnverifiedWalletOperation,
  createUnverifiedWalletOperationComparisonSnapshot,
  createWalletOperationCommitBindingRecord,
  type UnverifiedWalletProjectionLimitPolicySnapshot
} from "./wallet-operation-projection";
import {
  availableAccount,
  payoutPendingAccount,
  projectionLimitPolicy,
  sha,
  wallet,
  walletOperationLinks,
  walletProjectionDecoderEnvelope
} from "./wallet-operation-base.fixture";

export function payoutJournal(
  overrides: Readonly<{
    sourceId?: string;
    occurredAt?: string;
    entries?: readonly unknown[];
  }> = {}
) {
  const sourceKey = createFinanceSourceKey({
    kind: "payout",
    sourceId: overrides.sourceId ?? "payout-request-1",
    operation: "requested"
  });
  return createFinanceJournalTransaction({
    id: "journal-payout-request-1",
    sourceKey,
    occurredAt: overrides.occurredAt ?? "2026-08-03T10:00:00Z",
    postedAt: "2026-08-03T10:00:01Z",
    reversesTransactionId: null,
    entries: (overrides.entries ?? [
      {
        account: availableAccount,
        side: "debit",
        amount: { amountMinor: 8_000, currency: "RUB" },
        links: walletOperationLinks
      },
      {
        account: payoutPendingAccount,
        side: "credit",
        amount: { amountMinor: 8_000, currency: "RUB" },
        links: {
          ...walletOperationLinks,
          payableLotId: "lot-payout-request-1-pending"
        }
      }
    ]) as Parameters<typeof createFinanceJournalTransaction>[0]["entries"]
  });
}

export function payoutSnapshotInput(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    authorizationStatus: "unverified",
    snapshotId: "wallet-lot-operation-payout-request-1",
    operationId: "payout-request-1",
    sourceKey: createFinanceSourceKey({
      kind: "payout",
      sourceId: "payout-request-1",
      operation: "requested"
    }),
    occurredAt: "2026-08-03T10:00:00Z",
    astrologerUserId: "astrologer-1",
    currency: "RUB",
    unverifiedLimitPolicy: projectionLimitPolicy(),
    previousLotStateDigest: sha("a"),
    nextLotStateDigest: sha("b"),
    historyRecordDigest: sha("c"),
    previousWalletRevision: "7",
    nextWalletRevision: "8",
    authorityRefs: [
      {
        kind: "payout_request",
        authorityId: "payout-request-authority-1",
        version: "1",
        canonicalDigest: sha("e")
      }
    ],
    economicEdges: [
      {
        edgeId: "payout-request-1-available-debit",
        bucket: "available",
        side: "debit",
        amount: { amountMinor: 8_000, currency: "RUB" },
        links: walletOperationLinks
      },
      {
        edgeId: "payout-request-1-pending-credit",
        bucket: "payout_pending",
        side: "credit",
        amount: { amountMinor: 8_000, currency: "RUB" },
        links: {
          ...walletOperationLinks,
          payableLotId: "lot-payout-request-1-pending"
        }
      }
    ],
    ...overrides
  };
}

export function payoutFixture(
  overrides: Readonly<{
    snapshotInput?: Record<string, unknown>;
    journal?: ReturnType<typeof payoutJournal>;
    previousWallet?: ReturnType<typeof wallet>;
    nextWallet?: ReturnType<typeof wallet>;
    boundAt?: string;
  }> = {}
) {
  const snapshotInput = overrides.snapshotInput ?? payoutSnapshotInput();
  const resolvedPolicy =
    snapshotInput.unverifiedLimitPolicy as UnverifiedWalletProjectionLimitPolicySnapshot;
  const operationSnapshot = createUnverifiedWalletOperationComparisonSnapshot(
    snapshotInput,
    walletProjectionDecoderEnvelope,
    resolvedPolicy
  );
  const journalTransaction = overrides.journal ?? payoutJournal();
  const previousWallet = overrides.previousWallet ?? wallet("7", { availableMinor: "8640" });
  const nextWallet =
    overrides.nextWallet ?? wallet("8", { availableMinor: "640", payoutPendingMinor: "8000" });
  const commitBinding = createWalletOperationCommitBindingRecord(
    {
      schemaVersion: 1,
      bindingId: "wallet-binding-payout-request-1",
      operationSnapshot,
      journalTransaction,
      previousWallet,
      nextWallet,
      boundAt: overrides.boundAt ?? "2026-08-03T10:00:02Z"
    },
    walletProjectionDecoderEnvelope,
    resolvedPolicy
  );
  return {
    operationSnapshot,
    journalTransaction,
    previousWallet,
    nextWallet,
    commitBinding
  };
}

export function compareFixture(fixture: ReturnType<typeof payoutFixture>) {
  return compareUnverifiedWalletOperation(
    fixture,
    walletProjectionDecoderEnvelope,
    fixture.operationSnapshot.unverifiedLimitPolicy
  );
}
