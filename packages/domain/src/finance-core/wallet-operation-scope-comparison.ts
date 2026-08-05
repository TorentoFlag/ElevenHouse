import { serializeFinanceSourceKey } from "./finance-source-key";
import type { FinanceJournalTransaction } from "./journal";
import type { WalletOperationProjectionDiscrepancy } from "./wallet-operation-comparison-types";
import { addWalletOperationDiscrepancy } from "./wallet-operation-discrepancy";
import type {
  UnverifiedWalletOperationComparisonSnapshot,
  WalletStoredSnapshot
} from "./wallet-operation-snapshot-types";
import { walletBalanceKeys } from "./wallet-operation-wallet-model";

export function addScopeAndRevisionDiscrepancies(
  operation: UnverifiedWalletOperationComparisonSnapshot,
  journal: FinanceJournalTransaction,
  previousWallet: WalletStoredSnapshot,
  nextWallet: WalletStoredSnapshot,
  discrepancies: WalletOperationProjectionDiscrepancy[]
): void {
  if (
    serializeFinanceSourceKey(journal.sourceKey) !== serializeFinanceSourceKey(operation.sourceKey)
  ) {
    addWalletOperationDiscrepancy(discrepancies, {
      kind: "journal_source_key_mismatch",
      expectedSourceKey: serializeFinanceSourceKey(operation.sourceKey),
      actualSourceKey: serializeFinanceSourceKey(journal.sourceKey)
    });
  }
  if (journal.occurredAt !== operation.occurredAt) {
    addWalletOperationDiscrepancy(discrepancies, {
      kind: "journal_occurred_at_mismatch",
      expectedOccurredAt: operation.occurredAt,
      actualOccurredAt: journal.occurredAt
    });
  }
  for (const [target, wallet] of [
    ["previous_wallet", previousWallet],
    ["next_wallet", nextWallet]
  ] as const) {
    if (wallet.astrologerUserId !== operation.astrologerUserId) {
      addWalletOperationDiscrepancy(discrepancies, {
        kind: "wallet_scope_mismatch",
        target,
        expectedAstrologerUserId: operation.astrologerUserId,
        actualAstrologerUserId: wallet.astrologerUserId
      });
    }
  }
  if (previousWallet.walletId !== nextWallet.walletId) {
    addWalletOperationDiscrepancy(discrepancies, {
      kind: "wallet_identity_mismatch",
      previousWalletId: previousWallet.walletId,
      nextWalletId: nextWallet.walletId
    });
  }
  const previousRevision = BigInt(previousWallet.revision);
  const nextRevision = BigInt(nextWallet.revision);
  if (nextRevision !== previousRevision + 1n) {
    addWalletOperationDiscrepancy(discrepancies, {
      kind: "wallet_revision_transition_mismatch",
      previousRevision: previousWallet.revision,
      nextRevision: nextWallet.revision,
      reason: nextRevision <= previousRevision ? "stale" : "skipped"
    });
  }
  for (const [position, expectedRevision, actualRevision] of [
    ["previous", operation.previousWalletRevision, previousWallet.revision],
    ["next", operation.nextWalletRevision, nextWallet.revision]
  ] as const) {
    if (expectedRevision !== actualRevision) {
      addWalletOperationDiscrepancy(discrepancies, {
        kind: "operation_wallet_revision_binding_mismatch",
        position,
        expectedRevision,
        actualRevision
      });
    }
  }
}

export function addNegativeBalanceDiscrepancies(
  wallet: WalletStoredSnapshot,
  position: "previous" | "next",
  discrepancies: WalletOperationProjectionDiscrepancy[]
): void {
  for (const balance of walletBalanceKeys) {
    const amountMinor = wallet.balances[balance];
    if (BigInt(amountMinor) < 0n) {
      addWalletOperationDiscrepancy(discrepancies, {
        kind: "negative_wallet_balance",
        position,
        balance,
        amountMinor
      });
    }
  }
}
