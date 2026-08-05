import { Temporal } from "@js-temporal/polyfill";
import { serializeFinanceSourceKey } from "./finance-source-key";
import type { FinanceJournalEntry, FinanceJournalTransaction } from "./journal";
import { serializeFinanceLedgerAccountRef } from "./ledger-chart";
import type { WalletProjectionDiscrepancy } from "./wallet-reference-types";

export function addDuplicateJournalDiscrepancies(
  transactions: readonly FinanceJournalTransaction[],
  discrepancies: WalletProjectionDiscrepancy[]
): void {
  const transactionIds = new Set<string>();
  const duplicatedTransactionIds = new Set<string>();
  const sourceKeys = new Set<string>();
  const duplicatedSourceKeys = new Set<string>();
  for (const transaction of transactions) {
    if (transactionIds.has(transaction.id)) duplicatedTransactionIds.add(transaction.id);
    transactionIds.add(transaction.id);
    const sourceKey = serializeFinanceSourceKey(transaction.sourceKey);
    if (sourceKeys.has(sourceKey)) duplicatedSourceKeys.add(sourceKey);
    sourceKeys.add(sourceKey);
  }
  for (const transactionId of [...duplicatedTransactionIds].sort()) {
    discrepancies.push(Object.freeze({ kind: "journal_duplicate_transaction_id", transactionId }));
  }
  for (const sourceKey of [...duplicatedSourceKeys].sort()) {
    discrepancies.push(Object.freeze({ kind: "journal_duplicate_source_key", sourceKey }));
  }
}

export function addJournalReversalDiscrepancies(
  transactions: readonly FinanceJournalTransaction[],
  discrepancies: WalletProjectionDiscrepancy[]
): void {
  const originalsById = new Map<string, FinanceJournalTransaction>();
  for (const transaction of transactions) {
    if (!originalsById.has(transaction.id)) originalsById.set(transaction.id, transaction);
  }
  const firstReversalByOriginalId = new Map<string, string>();
  const reversals = transactions
    .filter(
      (
        transaction
      ): transaction is FinanceJournalTransaction & { readonly reversesTransactionId: string } =>
        transaction.reversesTransactionId !== null
    )
    .sort(compareJournalTransactionIdentity);
  for (const reversal of reversals) {
    const originalId = reversal.reversesTransactionId;
    const firstReversalTransactionId = firstReversalByOriginalId.get(originalId);
    if (firstReversalTransactionId !== undefined) {
      discrepancies.push(
        Object.freeze({
          kind: "journal_duplicate_reversal",
          transactionId: reversal.id,
          reversesTransactionId: originalId,
          firstReversalTransactionId
        })
      );
    } else {
      firstReversalByOriginalId.set(originalId, reversal.id);
    }

    const original = originalsById.get(originalId);
    if (!original) {
      discrepancies.push(
        Object.freeze({
          kind: "journal_orphan_reversal",
          transactionId: reversal.id,
          reversesTransactionId: originalId
        })
      );
      continue;
    }
    if (!isExactJournalReversal(original, reversal)) {
      discrepancies.push(
        Object.freeze({
          kind: "journal_reversal_mismatch",
          transactionId: reversal.id,
          reversesTransactionId: originalId
        })
      );
    }
  }
}

function isExactJournalReversal(
  original: FinanceJournalTransaction,
  reversal: FinanceJournalTransaction
): boolean {
  if (original.entries.length !== reversal.entries.length) return false;
  return original.entries.every((entry, index) => {
    const reversed = reversal.entries[index];
    return (
      reversed !== undefined &&
      serializeFinanceLedgerAccountRef(entry.account) ===
        serializeFinanceLedgerAccountRef(reversed.account) &&
      reversed.side === (entry.side === "debit" ? "credit" : "debit") &&
      reversed.amount.amountMinor === entry.amount.amountMinor &&
      reversed.amount.currency === entry.amount.currency &&
      sameJournalLinks(entry, reversed)
    );
  });
}

function sameJournalLinks(left: FinanceJournalEntry, right: FinanceJournalEntry): boolean {
  return (
    left.links.originalSaleId === right.links.originalSaleId &&
    left.links.componentId === right.links.componentId &&
    left.links.payableLotId === right.links.payableLotId &&
    left.links.payoutAllocationId === right.links.payoutAllocationId
  );
}

function compareJournalTransactionIdentity(
  left: FinanceJournalTransaction,
  right: FinanceJournalTransaction
): number {
  return (
    Temporal.Instant.compare(left.postedAt, right.postedAt) ||
    Temporal.Instant.compare(left.occurredAt, right.occurredAt) ||
    compareCodeUnits(left.id, right.id)
  );
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
