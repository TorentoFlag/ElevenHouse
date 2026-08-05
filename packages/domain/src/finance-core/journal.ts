import { Temporal } from "@js-temporal/polyfill";
import type { Money } from "../money";
import { createFinanceSourceKey, type FinanceSourceKey } from "./finance-source-key";
import {
  createFinanceLedgerAccountRef,
  financeLedgerChart,
  serializeFinanceLedgerAccountRef,
  type FinanceLedgerAccountRef,
  type FinanceLedgerSide
} from "./ledger-chart";
import { readStrictOwnDataRecord } from "./strict-own-data";

export type FinanceJournalEntryLinks = {
  readonly originalSaleId: string | null;
  readonly componentId: string | null;
  readonly payableLotId: string | null;
  readonly payoutAllocationId: string | null;
};

export type FinanceJournalEntryInput = {
  readonly account: FinanceLedgerAccountRef;
  readonly side: FinanceLedgerSide;
  readonly amount: Money;
  readonly links: FinanceJournalEntryLinks;
};

export type FinanceJournalEntry = FinanceJournalEntryInput;

export type FinanceJournalTransactionInput = {
  readonly id: string;
  readonly sourceKey: FinanceSourceKey;
  readonly occurredAt: string;
  readonly postedAt: string;
  readonly reversesTransactionId: string | null;
  readonly entries: readonly FinanceJournalEntryInput[];
};

export type FinanceJournalTransaction = Omit<FinanceJournalTransactionInput, "entries"> & {
  readonly entries: readonly FinanceJournalEntry[];
  readonly currency: "RUB";
  readonly totalDebitMinor: string;
  readonly totalCreditMinor: string;
};

export type FinanceNormalBalanceProjection =
  | {
      readonly status: "normal";
      readonly account: FinanceLedgerAccountRef;
      readonly currency: "RUB";
      readonly balanceMinor: string;
    }
  | {
      readonly status: "abnormal";
      readonly account: FinanceLedgerAccountRef;
      readonly currency: "RUB";
      readonly signedNormalBalanceMinor: string;
      readonly discrepancy: {
        readonly code: "abnormal_normal_balance";
        readonly expectedNormalSide: FinanceLedgerSide;
      };
    };

export class FinanceJournalIntegrityError extends Error {
  readonly code = "finance_journal_integrity_error";

  constructor() {
    super("Finance journal transaction violates operational ledger invariants");
    this.name = "FinanceJournalIntegrityError";
  }
}

const transactionInputKeys = [
  "id",
  "sourceKey",
  "occurredAt",
  "postedAt",
  "reversesTransactionId",
  "entries"
] as const;

export function createFinanceJournalTransaction(
  input: FinanceJournalTransactionInput
): FinanceJournalTransaction {
  const candidate = exactDataRecord(input, transactionInputKeys);
  const id = identifier(candidate.id);
  const sourceKey = safeSourceKey(candidate.sourceKey);
  const occurredAt = instant(candidate.occurredAt);
  const postedAt = instant(candidate.postedAt);
  if (
    Temporal.Instant.compare(Temporal.Instant.from(postedAt), Temporal.Instant.from(occurredAt)) < 0
  ) {
    throw new FinanceJournalIntegrityError();
  }
  const reversesTransactionId = nullableIdentifier(candidate.reversesTransactionId);
  const reversalSource = sourceKey.kind === "correction" && sourceKey.operation === "reversal";
  if (
    reversalSource !== (reversesTransactionId !== null) ||
    (reversalSource && sourceKey.sourceId !== reversesTransactionId) ||
    (reversalSource && id === reversesTransactionId)
  ) {
    throw new FinanceJournalIntegrityError();
  }

  const rawEntries = exactDataArray(candidate.entries, 2);
  let debit = 0n;
  let credit = 0n;
  const entries = rawEntries.map((entry) => {
    const safeEntry = createSafeEntry(entry);
    if (safeEntry.side === "debit") debit += BigInt(safeEntry.amount.amountMinor);
    else credit += BigInt(safeEntry.amount.amountMinor);
    return safeEntry;
  });
  if (debit !== credit) throw new FinanceJournalIntegrityError();

  return Object.freeze({
    id,
    sourceKey,
    occurredAt,
    postedAt,
    reversesTransactionId,
    entries: Object.freeze(entries),
    currency: "RUB",
    totalDebitMinor: debit.toString(),
    totalCreditMinor: credit.toString()
  });
}

export function reverseFinanceJournalTransaction(input: {
  readonly original: FinanceJournalTransaction;
  readonly id: string;
  readonly sourceKey: FinanceSourceKey;
  readonly occurredAt: string;
  readonly postedAt: string;
}): FinanceJournalTransaction {
  const candidate = exactDataRecord(input, [
    "original",
    "id",
    "sourceKey",
    "occurredAt",
    "postedAt"
  ]);
  const original = normalizeJournalTransaction(candidate.original);
  const id = identifier(candidate.id);
  if (id === original.id) throw new FinanceJournalIntegrityError();
  const sourceKey = safeSourceKey(candidate.sourceKey);
  if (
    sourceKey.kind !== "correction" ||
    sourceKey.operation !== "reversal" ||
    sourceKey.sourceId !== original.id
  ) {
    throw new FinanceJournalIntegrityError();
  }

  return createFinanceJournalTransaction({
    id,
    sourceKey,
    occurredAt: instant(candidate.occurredAt),
    postedAt: instant(candidate.postedAt),
    reversesTransactionId: original.id,
    entries: original.entries.map((entry) => ({
      account: entry.account,
      side: entry.side === "debit" ? "credit" : "debit",
      amount: entry.amount,
      links: entry.links
    }))
  });
}

export function projectFinanceAccountBalance(input: {
  readonly account: FinanceLedgerAccountRef;
  readonly entries: readonly FinanceJournalEntryInput[];
}): FinanceNormalBalanceProjection {
  const candidate = exactDataRecord(input, ["account", "entries"]);
  const account = safeAccount(candidate.account);
  const accountKey = serializeFinanceLedgerAccountRef(account);
  let debit = 0n;
  let credit = 0n;
  for (const entry of exactDataArray(candidate.entries, 0)) {
    const safeEntry = createSafeEntry(entry);
    if (serializeFinanceLedgerAccountRef(safeEntry.account) !== accountKey) {
      throw new FinanceJournalIntegrityError();
    }
    if (safeEntry.side === "debit") debit += BigInt(safeEntry.amount.amountMinor);
    else credit += BigInt(safeEntry.amount.amountMinor);
  }

  const normalSide = financeLedgerChart[account.code].normalSide;
  const signedBalance = normalSide === "debit" ? debit - credit : credit - debit;
  if (signedBalance >= 0n) {
    return Object.freeze({
      status: "normal",
      account,
      currency: "RUB",
      balanceMinor: signedBalance.toString()
    });
  }
  return Object.freeze({
    status: "abnormal",
    account,
    currency: "RUB",
    signedNormalBalanceMinor: signedBalance.toString(),
    discrepancy: Object.freeze({
      code: "abnormal_normal_balance",
      expectedNormalSide: normalSide
    })
  });
}

function normalizeJournalTransaction(input: unknown): FinanceJournalTransaction {
  const candidate = exactDataRecord(input, [
    ...transactionInputKeys,
    "currency",
    "totalDebitMinor",
    "totalCreditMinor"
  ]);
  if (candidate.currency !== "RUB") throw new FinanceJournalIntegrityError();
  const rebuilt = createFinanceJournalTransaction({
    id: candidate.id as string,
    sourceKey: candidate.sourceKey as FinanceSourceKey,
    occurredAt: candidate.occurredAt as string,
    postedAt: candidate.postedAt as string,
    reversesTransactionId: candidate.reversesTransactionId as string | null,
    entries: candidate.entries as readonly FinanceJournalEntryInput[]
  });
  if (
    candidate.totalDebitMinor !== rebuilt.totalDebitMinor ||
    candidate.totalCreditMinor !== rebuilt.totalCreditMinor
  ) {
    throw new FinanceJournalIntegrityError();
  }
  return rebuilt;
}

function createSafeEntry(input: unknown): FinanceJournalEntry {
  const candidate = exactDataRecord(input, ["account", "side", "amount", "links"]);
  const account = safeAccount(candidate.account);
  if (candidate.side !== "debit" && candidate.side !== "credit") {
    throw new FinanceJournalIntegrityError();
  }
  const amountCandidate = exactDataRecord(candidate.amount, ["amountMinor", "currency"]);
  if (
    amountCandidate.currency !== "RUB" ||
    !Number.isSafeInteger(amountCandidate.amountMinor) ||
    (amountCandidate.amountMinor as number) <= 0 ||
    account.currency !== amountCandidate.currency
  ) {
    throw new FinanceJournalIntegrityError();
  }
  const links = safeEntryLinks(candidate.links);
  return Object.freeze({
    account,
    side: candidate.side,
    amount: Object.freeze({ amountMinor: amountCandidate.amountMinor as number, currency: "RUB" }),
    links
  });
}

function safeEntryLinks(input: unknown): FinanceJournalEntryLinks {
  const candidate = exactDataRecord(input, [
    "originalSaleId",
    "componentId",
    "payableLotId",
    "payoutAllocationId"
  ]);
  return Object.freeze({
    originalSaleId: nullableIdentifier(candidate.originalSaleId),
    componentId: nullableIdentifier(candidate.componentId),
    payableLotId: nullableIdentifier(candidate.payableLotId),
    payoutAllocationId: nullableIdentifier(candidate.payoutAllocationId)
  });
}

function safeAccount(input: unknown): FinanceLedgerAccountRef {
  try {
    return createFinanceLedgerAccountRef(input);
  } catch {
    throw new FinanceJournalIntegrityError();
  }
}

function safeSourceKey(input: unknown): FinanceSourceKey {
  try {
    return createFinanceSourceKey(input);
  } catch {
    throw new FinanceJournalIntegrityError();
  }
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 200
  ) {
    throw new FinanceJournalIntegrityError();
  }
  return value;
}

function nullableIdentifier(value: unknown): string | null {
  return value === null ? null : identifier(value);
}

function instant(value: unknown): string {
  if (typeof value !== "string") throw new FinanceJournalIntegrityError();
  try {
    return Temporal.Instant.from(value).toString();
  } catch {
    throw new FinanceJournalIntegrityError();
  }
}

function exactDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys
): Readonly<Record<Keys[number], unknown>> {
  try {
    return readStrictOwnDataRecord(value, expectedKeys, () => {
      throw new FinanceJournalIntegrityError();
    });
  } catch (error) {
    if (error instanceof FinanceJournalIntegrityError) throw error;
    throw new FinanceJournalIntegrityError();
  }
}

function exactDataArray(value: unknown, minimumLength: number): readonly unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      throw new FinanceJournalIntegrityError();
    }
    const keys = Reflect.ownKeys(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor)) {
      throw new FinanceJournalIntegrityError();
    }
    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < minimumLength || keys.length !== length + 1) {
      throw new FinanceJournalIntegrityError();
    }
    const values: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) {
        throw new FinanceJournalIntegrityError();
      }
      values.push(descriptor.value);
    }
    if (
      keys.some(
        (key) =>
          typeof key !== "string" ||
          (key !== "length" && !Number.isSafeInteger(Number(key))) ||
          (key !== "length" && (Number(key) < 0 || Number(key) >= length))
      )
    ) {
      throw new FinanceJournalIntegrityError();
    }
    return values;
  } catch (error) {
    if (error instanceof FinanceJournalIntegrityError) throw error;
    throw new FinanceJournalIntegrityError();
  }
}
