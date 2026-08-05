import type { FinanceJournalEntry, FinanceJournalTransaction } from "../journal";
import type { ChargebackRecoveryPostingAllocationAuthority } from "./chargeback-recovery-posting-types";
import { FinancePostingIntegrityError } from "./posting-codec";

const payableCodes = new Set(["astrologer_pending", "astrologer_available", "astrologer_reserved"]);

export function assertChargebackResolutionRecoveryJournal(
  authority: ChargebackRecoveryPostingAllocationAuthority,
  transaction: FinanceJournalTransaction
): void {
  if (
    transaction.sourceKey.kind !== "chargeback" ||
    transaction.sourceKey.operation !== "recovery_collected" ||
    transaction.sourceKey.sourceId !== authority.sourceAuthority.recoveryCollectionId ||
    transaction.occurredAt !== authority.collectedAt
  )
    mismatch();
  const unused = new Set(transaction.entries.map((_, index) => index));
  for (const collection of authority.collectionRows) {
    const debit = consume(
      unused,
      transaction.entries,
      (entry) =>
        payableCodes.has(entry.account.code) &&
        "astrologerUserId" in entry.account &&
        entry.account.astrologerUserId === authority.astrologerUserId &&
        entry.side === "debit" &&
        entry.amount.amountMinor === collection.amount.amountMinor &&
        entry.links.originalSaleId === authority.sourceAuthority.collectionSource.sourceOrderId &&
        entry.links.componentId === collection.receiptPayableComponentId
    );
    const credit = consume(
      unused,
      transaction.entries,
      (entry) =>
        entry.account.code === "astrologer_recovery_receivable" &&
        entry.account.astrologerUserId === authority.astrologerUserId &&
        entry.side === "credit" &&
        entry.amount.amountMinor === collection.amount.amountMinor &&
        entry.links.originalSaleId === authority.sourceAuthority.collectionSource.sourceOrderId &&
        entry.links.componentId === collection.receiptRecoveryComponentId
    );
    if (
      debit.links.payableLotId === null ||
      debit.links.payableLotId !== credit.links.payableLotId ||
      debit.links.payoutAllocationId !== credit.links.payoutAllocationId
    )
      mismatch();
  }
  if (unused.size !== 0) mismatch();
}

function consume(
  unused: Set<number>,
  entries: readonly FinanceJournalEntry[],
  predicate: (entry: FinanceJournalEntry) => boolean
): FinanceJournalEntry {
  const index = [...unused].find((candidate) => predicate(entries[candidate]!));
  if (index === undefined) mismatch();
  unused.delete(index);
  return entries[index]!;
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("proof_transaction_mismatch");
}
