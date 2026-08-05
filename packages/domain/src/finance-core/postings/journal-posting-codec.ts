import {
  createFinanceJournalTransaction,
  type FinanceJournalEntryLinks,
  type FinanceJournalEntryInput,
  type FinanceJournalTransaction
} from "../journal";
import { createFinanceLedgerAccountRef } from "../ledger-chart";
import {
  assertFinancePostingNotProxy,
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readFinancePostingSourceKey
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import type { FinanceJournalLinkProofEdge } from "./posting-types";

export function readFinanceJournalLinkProofEdge(
  input: unknown,
  expectedIndex: number,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): FinanceJournalLinkProofEdge {
  normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, [
    "entryIndex",
    "account",
    "side",
    "amount",
    "links",
    "semanticEdgeId",
    "lotAllocationId"
  ]);
  if (
    fields.entryIndex !== expectedIndex ||
    (fields.side !== "debit" && fields.side !== "credit")
  ) {
    throw new FinancePostingIntegrityError("invalid_shape");
  }
  let account;
  try {
    if (typeof fields.account !== "object" || fields.account === null) {
      throw new FinancePostingIntegrityError("invalid_shape");
    }
    assertFinancePostingNotProxy(fields.account);
    account = createFinanceLedgerAccountRef(fields.account);
  } catch (error) {
    if (error instanceof FinancePostingIntegrityError) throw error;
    throw new FinancePostingIntegrityError("invalid_shape");
  }
  const amount = readFinancePostingMoney(fields.amount);
  if (account.currency !== amount.currency) {
    throw new FinancePostingIntegrityError("scope_mismatch");
  }
  return Object.freeze({
    entryIndex: expectedIndex,
    account,
    side: fields.side,
    amount,
    links: readFinanceJournalEntryLinks(fields.links),
    semanticEdgeId: readNullableFinancePostingIdentifier(fields.semanticEdgeId),
    lotAllocationId: readNullableFinancePostingIdentifier(fields.lotAllocationId)
  });
}

export function readFinancePostingJournalTransaction(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): FinanceJournalTransaction {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  try {
    const fields = readExactDataRecord(input, [
      "id",
      "sourceKey",
      "occurredAt",
      "postedAt",
      "reversesTransactionId",
      "entries",
      "currency",
      "totalDebitMinor",
      "totalCreditMinor"
    ]);
    if (fields.currency !== "RUB") {
      throw new FinancePostingIntegrityError("proof_transaction_mismatch");
    }
    const reversesTransactionId =
      fields.reversesTransactionId === null
        ? null
        : readFinancePostingIdentifier(fields.reversesTransactionId);
    const entries = readExactDataArray(fields.entries, 2, decoderEnvelope.maxJournalEntries).map(
      (entry) => readFinancePostingJournalEntry(entry, decoderEnvelope)
    );
    const transaction = createFinanceJournalTransaction({
      id: readFinancePostingIdentifier(fields.id),
      sourceKey: readFinancePostingSourceKey(fields.sourceKey),
      occurredAt: readFinancePostingInstant(fields.occurredAt),
      postedAt: readFinancePostingInstant(fields.postedAt),
      reversesTransactionId,
      entries
    });
    if (
      fields.totalDebitMinor !== transaction.totalDebitMinor ||
      fields.totalCreditMinor !== transaction.totalCreditMinor
    ) {
      throw new FinancePostingIntegrityError("proof_transaction_mismatch");
    }
    return transaction;
  } catch (error) {
    if (error instanceof FinancePostingIntegrityError) throw error;
    throw new FinancePostingIntegrityError("proof_transaction_mismatch");
  }
}

export function readFinancePostingJournalEntry(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): FinanceJournalEntryInput {
  normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, ["account", "side", "amount", "links"]);
  if (fields.side !== "debit" && fields.side !== "credit") {
    throw new FinancePostingIntegrityError("proof_transaction_mismatch");
  }
  let account;
  try {
    if (typeof fields.account !== "object" || fields.account === null) {
      throw new FinancePostingIntegrityError("proof_transaction_mismatch");
    }
    assertFinancePostingNotProxy(fields.account);
    account = createFinanceLedgerAccountRef(fields.account);
  } catch (error) {
    if (error instanceof FinancePostingIntegrityError) throw error;
    throw new FinancePostingIntegrityError("proof_transaction_mismatch");
  }
  const amount = readFinancePostingMoney(fields.amount);
  if (amount.currency !== account.currency) {
    throw new FinancePostingIntegrityError("proof_transaction_mismatch");
  }
  return Object.freeze({
    account,
    side: fields.side,
    amount,
    links: readFinanceJournalEntryLinks(fields.links)
  });
}

function readFinanceJournalEntryLinks(input: unknown): FinanceJournalEntryLinks {
  const fields = readExactDataRecord(input, [
    "originalSaleId",
    "componentId",
    "payableLotId",
    "payoutAllocationId"
  ]);
  return Object.freeze({
    originalSaleId: readNullableFinancePostingIdentifier(fields.originalSaleId),
    componentId: readNullableFinancePostingIdentifier(fields.componentId),
    payableLotId: readNullableFinancePostingIdentifier(fields.payableLotId),
    payoutAllocationId: readNullableFinancePostingIdentifier(fields.payoutAllocationId)
  });
}

function readNullableFinancePostingIdentifier(input: unknown): string | null {
  return input === null ? null : readFinancePostingIdentifier(input);
}
