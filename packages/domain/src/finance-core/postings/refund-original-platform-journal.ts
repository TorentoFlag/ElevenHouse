import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { FinanceJournalTransaction } from "../journal";
import { readFinancePostingJournalTransaction } from "./journal-posting-codec";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataArray
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";

export function readAndAssertRefundOriginalPlatformJournals(
  input: unknown,
  allocation: RefundPostingAllocationAuthorityV1,
  confirmedAt: string,
  envelope: FinancePostingDecoderEnvelope
): readonly FinanceJournalTransaction[] {
  const transactions = Object.freeze(
    readExactDataArray(input, 0, envelope.maxAllocations).map((value) =>
      readFinancePostingJournalTransaction(value, envelope)
    )
  );
  const byId = new Map<string, FinanceJournalTransaction>();
  for (const transaction of transactions) {
    if (byId.has(transaction.id)) mismatch();
    byId.set(transaction.id, transaction);
  }
  const referenced = new Set<string>();
  for (const component of allocation.platformCommissionComponents) {
    const transaction = byId.get(component.sourceJournalTransactionId);
    const entry = transaction?.entries[component.sourceJournalEntryIndex];
    const expectedOperation =
      component.sourceAccountCode === "platform_commission_deferred"
        ? "sale_captured"
        : "commission_earned";
    if (
      !transaction ||
      !entry ||
      transaction.sourceKey.kind !== "order" ||
      transaction.sourceKey.sourceId !== allocation.orderId ||
      transaction.sourceKey.operation !== expectedOperation ||
      compareFinancePostingInstants(transaction.occurredAt, allocation.approvedAt) > 0 ||
      compareFinancePostingInstants(transaction.postedAt, allocation.approvedAt) > 0 ||
      compareFinancePostingInstants(transaction.occurredAt, confirmedAt) > 0 ||
      compareFinancePostingInstants(transaction.postedAt, confirmedAt) > 0 ||
      hashFinanceCommandPayload(entry) !== component.sourceEntryDigest ||
      entry.side !== "credit" ||
      entry.account.code !== component.sourceAccountCode ||
      entry.links.originalSaleId !== allocation.orderId ||
      entry.links.componentId !== component.componentId ||
      entry.links.payableLotId !== null ||
      entry.links.payoutAllocationId !== null ||
      entry.amount.currency !== component.sourceAllocation.sourceAmount.currency ||
      entry.amount.amountMinor !== component.sourceAllocation.sourceAmount.amountMinor ||
      component.sourceAllocation.nextAllocatedAmount.amountMinor > entry.amount.amountMinor
    ) {
      mismatch();
    }
    referenced.add(transaction.id);
  }
  if (referenced.size !== transactions.length) mismatch();
  return transactions;
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("proof_transaction_mismatch");
}
