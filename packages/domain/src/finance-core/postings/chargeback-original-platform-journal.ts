import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { FinanceJournalTransaction } from "../journal";
import type { ChargebackPlatformPostingAllocation } from "./chargeback-posting-allocation-types";
import type { UnverifiedChargebackPrincipalPositionTransitionBinding } from "./chargeback-principal-position-types";
import { readFinancePostingJournalTransaction } from "./journal-posting-codec";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataArray
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";

export function readAndAssertChargebackOriginalPlatformJournals(
  input: unknown,
  allocations: readonly ChargebackPlatformPostingAllocation[],
  platformPositions: UnverifiedChargebackPrincipalPositionTransitionBinding["platformPositions"],
  allocationApprovedAt: string,
  envelope: FinancePostingDecoderEnvelope
): readonly FinanceJournalTransaction[] {
  const transactions = Object.freeze(
    readExactDataArray(input, 0, envelope.maxAllocations).map((value) =>
      readFinancePostingJournalTransaction(value, envelope)
    )
  );
  const byId = new Map<string, FinanceJournalTransaction>();
  for (const transaction of transactions) {
    if (byId.has(transaction.id)) throw mismatch();
    byId.set(transaction.id, transaction);
  }
  const referenced = new Set<string>();
  for (const allocation of allocations) {
    if (allocation.originalJournalEntry === null) continue;
    const reference = allocation.originalJournalEntry;
    const transaction = byId.get(reference.transactionId);
    const entry = transaction?.entries[reference.entryIndex];
    const position = platformPositions.find(
      (candidate) => candidate.positionId === allocation.allocationId
    );
    const expectedOperation =
      allocation.accountCode === "platform_commission_deferred"
        ? "sale_captured"
        : "commission_earned";
    if (
      !transaction ||
      !entry ||
      transaction.sourceKey.kind !== "order" ||
      transaction.sourceKey.sourceId !== allocation.originalSaleId ||
      transaction.sourceKey.operation !== expectedOperation ||
      compareFinancePostingInstants(transaction.occurredAt, allocationApprovedAt) > 0 ||
      compareFinancePostingInstants(transaction.postedAt, allocationApprovedAt) > 0 ||
      hashFinanceCommandPayload(entry) !== reference.canonicalDigest ||
      entry.side !== "credit" ||
      entry.account.code !== allocation.accountCode ||
      entry.links.originalSaleId !== allocation.originalSaleId ||
      entry.links.componentId !== allocation.componentId ||
      entry.links.payableLotId !== null ||
      entry.links.payoutAllocationId !== null ||
      entry.amount.currency !== allocation.amount.currency ||
      entry.amount.amountMinor < allocation.amount.amountMinor ||
      position?.kind !== "platform_commission_reversal" ||
      position.originalCommissionAmount.currency !== entry.amount.currency ||
      position.originalCommissionAmount.amountMinor !== entry.amount.amountMinor
    ) {
      throw mismatch();
    }
    referenced.add(transaction.id);
  }
  if (referenced.size !== transactions.length) throw mismatch();
  return transactions;
}

function mismatch(): FinancePostingIntegrityError {
  return new FinancePostingIntegrityError("proof_transaction_mismatch");
}
