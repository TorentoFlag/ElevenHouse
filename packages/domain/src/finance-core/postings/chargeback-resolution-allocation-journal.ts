import type { FinanceJournalEntry, FinanceJournalTransaction } from "../journal";
import type { ChargebackPrincipalPostingAllocationAuthority } from "./chargeback-posting-allocation-types";
import { FinancePostingIntegrityError } from "./posting-codec";

const payableCodes = new Set(["astrologer_pending", "astrologer_available", "astrologer_reserved"]);

export function assertChargebackResolutionAllocationJournal(
  authority: ChargebackPrincipalPostingAllocationAuthority,
  transaction: FinanceJournalTransaction
): void {
  if (
    transaction.sourceKey.kind !== "chargeback" ||
    transaction.sourceKey.operation !== "principal_allocated" ||
    transaction.sourceKey.sourceId !== authority.sourceAuthority.accountingAllocationRevisionId ||
    transaction.occurredAt !== authority.approvedAt
  )
    mismatch();
  const unused = new Set(transaction.entries.map((_, index) => index));
  for (const row of authority.recoveryAllocations) {
    consume(
      unused,
      transaction.entries,
      (entry) =>
        entry.account.code === "astrologer_recovery_receivable" &&
        "astrologerUserId" in entry.account &&
        entry.account.astrologerUserId === authority.astrologerUserId &&
        entry.side === "debit" &&
        entry.amount.amountMinor === row.amount.amountMinor &&
        links(entry, row.originalSaleId, row.componentId, row.payableLotId, row.payoutAllocationId)
    );
  }
  for (const row of authority.platformAllocations) {
    consume(
      unused,
      transaction.entries,
      (entry) =>
        entry.account.code === row.accountCode &&
        entry.side === "debit" &&
        entry.amount.amountMinor === row.amount.amountMinor &&
        links(entry, row.originalSaleId, row.componentId, null, null)
    );
  }
  consume(
    unused,
    transaction.entries,
    (entry) =>
      entry.account.code === "chargeback_principal_suspense" &&
      "arcProviderAccountId" in entry.account &&
      entry.account.arcProviderAccountId === authority.arcProviderAccountId &&
      entry.side === "credit" &&
      entry.amount.amountMinor === authority.principalAllocationDelta.amountMinor &&
      links(
        entry,
        authority.orderId,
        authority.confirmedProviderEvidenceBinding.principalComponentId,
        null,
        null
      )
  );
  let payable = 0n;
  for (const index of unused) {
    const entry = transaction.entries[index];
    if (
      !entry ||
      !payableCodes.has(entry.account.code) ||
      !("astrologerUserId" in entry.account) ||
      entry.account.astrologerUserId !== authority.astrologerUserId ||
      entry.side !== "debit" ||
      entry.links.originalSaleId !== authority.orderId ||
      entry.links.componentId === null ||
      entry.links.payableLotId === null
    )
      mismatch();
    payable += BigInt(entry.amount.amountMinor);
  }
  if (payable !== BigInt(authority.payablePrincipal.amountMinor)) mismatch("amount_mismatch");
}

function consume(
  unused: Set<number>,
  entries: readonly FinanceJournalEntry[],
  predicate: (entry: FinanceJournalEntry) => boolean
) {
  const index = [...unused].find((candidate) => predicate(entries[candidate]!));
  if (index === undefined) mismatch();
  unused.delete(index);
}

function links(
  entry: FinanceJournalEntry,
  sale: string,
  component: string,
  lot: string | null,
  payout: string | null
) {
  return (
    entry.links.originalSaleId === sale &&
    entry.links.componentId === component &&
    entry.links.payableLotId === lot &&
    entry.links.payoutAllocationId === payout
  );
}

function mismatch(
  reason: "proof_transaction_mismatch" | "amount_mismatch" = "proof_transaction_mismatch"
): never {
  throw new FinancePostingIntegrityError(reason);
}
