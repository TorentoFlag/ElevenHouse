import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { readFinancePostingJournalTransaction } from "./journal-posting-codec";
import type { ChargebackResolutionHistory } from "./chargeback-resolution-types";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataArray
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";

export function assertChargebackResolutionPlatformHistory(
  input: unknown,
  history: ChargebackResolutionHistory,
  envelope: FinancePostingDecoderEnvelope
): void {
  const transactions = readExactDataArray(input, 0, envelope.maxAllocations).map((value) =>
    readFinancePostingJournalTransaction(value, envelope)
  );
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction] as const));
  if (byId.size !== transactions.length) mismatch();
  const used = new Set<string>();
  for (const allocation of history.allocations) {
    for (const row of allocation.platformAllocations) {
      if (row.originalJournalEntry === null) continue;
      const reference = row.originalJournalEntry;
      const transaction = byId.get(reference.transactionId);
      const entry = transaction?.entries[reference.entryIndex];
      const operation =
        row.accountCode === "platform_commission_deferred" ? "sale_captured" : "commission_earned";
      if (
        !transaction ||
        !entry ||
        transaction.sourceKey.kind !== "order" ||
        transaction.sourceKey.sourceId !== row.originalSaleId ||
        transaction.sourceKey.operation !== operation ||
        compareFinancePostingInstants(transaction.occurredAt, allocation.approvedAt) > 0 ||
        compareFinancePostingInstants(transaction.postedAt, allocation.approvedAt) > 0 ||
        hashFinanceCommandPayload(entry) !== reference.canonicalDigest ||
        entry.side !== "credit" ||
        entry.account.code !== row.accountCode ||
        entry.amount.amountMinor < row.amount.amountMinor ||
        entry.links.originalSaleId !== row.originalSaleId ||
        entry.links.componentId !== row.componentId ||
        entry.links.payableLotId !== null ||
        entry.links.payoutAllocationId !== null
      )
        mismatch();
      used.add(transaction.id);
    }
  }
  if (used.size !== transactions.length) mismatch();
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("proof_transaction_mismatch");
}
