import {
  createFinanceJournalTransaction,
  type FinanceJournalEntryInput,
  type FinanceJournalTransaction
} from "./journal";
import {
  createFinanceLedgerAccountRef,
  financeLedgerChart,
  type FinanceLedgerAccountCode,
  type FinanceLedgerAccountRef
} from "./ledger-chart";
import {
  normalizeWalletProjectionDecoderEnvelope,
  readWalletOperationExactDataArray,
  readWalletOperationExactDataRecord,
  readWalletOperationOwnDataProperty,
  walletOperationFail,
  walletOperationIntegrityBoundary
} from "./wallet-operation-codec-boundary";
import {
  normalizeWalletOperationIdentifier,
  normalizeWalletOperationInstant,
  normalizeWalletOperationNullableIdentifier,
  normalizeWalletOperationSignedDecimal,
  normalizeWalletOperationSourceKey,
  normalizeWalletOperationUnsignedDecimal
} from "./wallet-operation-codec-primitives";
import type {
  WalletProjectionDecoderEnvelope,
  WalletStoredSnapshot
} from "./wallet-operation-snapshot-types";

const walletKeys = ["walletId", "revision", "astrologerUserId", "currency", "balances"] as const;
const walletBalanceKeys = [
  "pendingMinor",
  "availableMinor",
  "reservedMinor",
  "payoutPendingMinor",
  "refundPendingMinor",
  "recoveryReceivableMinor"
] as const;
const journalKeys = [
  "id",
  "sourceKey",
  "occurredAt",
  "postedAt",
  "reversesTransactionId",
  "entries",
  "currency",
  "totalDebitMinor",
  "totalCreditMinor"
] as const;
const journalEntryKeys = ["account", "side", "amount", "links"] as const;
const moneyKeys = ["amountMinor", "currency"] as const;
const linkKeys = ["originalSaleId", "componentId", "payableLotId", "payoutAllocationId"] as const;

export function hydrateWalletStoredSnapshot(
  input: unknown,
  decoderEnvelope: WalletProjectionDecoderEnvelope
): WalletStoredSnapshot {
  return walletOperationIntegrityBoundary(() => {
    const envelope = normalizeWalletProjectionDecoderEnvelope(decoderEnvelope);
    return hydrateWalletStoredSnapshotCore(input, envelope);
  });
}

export function hydrateWalletJournalTransaction(
  input: unknown,
  decoderEnvelope: WalletProjectionDecoderEnvelope
): FinanceJournalTransaction {
  return walletOperationIntegrityBoundary(() => {
    const envelope = normalizeWalletProjectionDecoderEnvelope(decoderEnvelope);
    return hydrateWalletJournalTransactionCore(input, envelope);
  });
}

export function hydrateWalletStoredSnapshotCore(
  input: unknown,
  envelope: WalletProjectionDecoderEnvelope
): WalletStoredSnapshot {
  const fields = readWalletOperationExactDataRecord(input, walletKeys);
  if (fields.currency !== "RUB") walletOperationFail("invalid_field");
  const balanceFields = readWalletOperationExactDataRecord(fields.balances, walletBalanceKeys);
  return Object.freeze({
    walletId: normalizeWalletOperationIdentifier(fields.walletId),
    revision: normalizeWalletOperationUnsignedDecimal(fields.revision, envelope),
    astrologerUserId: normalizeWalletOperationIdentifier(fields.astrologerUserId),
    currency: "RUB",
    balances: Object.freeze({
      pendingMinor: normalizeWalletOperationSignedDecimal(balanceFields.pendingMinor, envelope),
      availableMinor: normalizeWalletOperationSignedDecimal(balanceFields.availableMinor, envelope),
      reservedMinor: normalizeWalletOperationSignedDecimal(balanceFields.reservedMinor, envelope),
      payoutPendingMinor: normalizeWalletOperationSignedDecimal(
        balanceFields.payoutPendingMinor,
        envelope
      ),
      refundPendingMinor: normalizeWalletOperationSignedDecimal(
        balanceFields.refundPendingMinor,
        envelope
      ),
      recoveryReceivableMinor: normalizeWalletOperationSignedDecimal(
        balanceFields.recoveryReceivableMinor,
        envelope
      )
    })
  });
}

export function hydrateWalletJournalTransactionCore(
  input: unknown,
  envelope: WalletProjectionDecoderEnvelope
): FinanceJournalTransaction {
  const fields = readWalletOperationExactDataRecord(input, journalKeys);
  if (fields.currency !== "RUB") walletOperationFail("invalid_field");
  const totalDebitMinor = normalizeWalletOperationUnsignedDecimal(fields.totalDebitMinor, envelope);
  const totalCreditMinor = normalizeWalletOperationUnsignedDecimal(
    fields.totalCreditMinor,
    envelope
  );
  const entries = readWalletOperationExactDataArray(
    fields.entries,
    2,
    envelope.maxJournalEntries.toString(),
    envelope.maxJournalEntries
  ).map(normalizeWalletJournalEntry);
  const transaction = createFinanceJournalTransaction({
    id: normalizeWalletOperationIdentifier(fields.id),
    sourceKey: normalizeWalletOperationSourceKey(fields.sourceKey),
    occurredAt: normalizeWalletOperationInstant(fields.occurredAt),
    postedAt: normalizeWalletOperationInstant(fields.postedAt),
    reversesTransactionId: normalizeWalletOperationNullableIdentifier(fields.reversesTransactionId),
    entries
  });
  normalizeWalletOperationUnsignedDecimal(transaction.totalDebitMinor, envelope);
  normalizeWalletOperationUnsignedDecimal(transaction.totalCreditMinor, envelope);
  if (
    totalDebitMinor !== transaction.totalDebitMinor ||
    totalCreditMinor !== transaction.totalCreditMinor
  ) {
    walletOperationFail("invalid_field");
  }
  return transaction;
}

function normalizeWalletJournalEntry(input: unknown): FinanceJournalEntryInput {
  const fields = readWalletOperationExactDataRecord(input, journalEntryKeys);
  if (fields.side !== "debit" && fields.side !== "credit") {
    walletOperationFail("invalid_field");
  }
  const amountFields = readWalletOperationExactDataRecord(fields.amount, moneyKeys);
  if (
    amountFields.currency !== "RUB" ||
    !Number.isSafeInteger(amountFields.amountMinor) ||
    (amountFields.amountMinor as number) <= 0
  ) {
    walletOperationFail("invalid_field");
  }
  const links = readWalletOperationExactDataRecord(fields.links, linkKeys);
  return Object.freeze({
    account: normalizeWalletJournalAccount(fields.account),
    side: fields.side,
    amount: Object.freeze({ amountMinor: amountFields.amountMinor as number, currency: "RUB" }),
    links: Object.freeze({
      originalSaleId: normalizeWalletOperationNullableIdentifier(links.originalSaleId),
      componentId: normalizeWalletOperationNullableIdentifier(links.componentId),
      payableLotId: normalizeWalletOperationNullableIdentifier(links.payableLotId),
      payoutAllocationId: normalizeWalletOperationNullableIdentifier(links.payoutAllocationId)
    })
  });
}

function normalizeWalletJournalAccount(input: unknown): FinanceLedgerAccountRef {
  const rawCode = readWalletOperationOwnDataProperty(input, "code");
  if (
    typeof rawCode !== "string" ||
    !Object.prototype.hasOwnProperty.call(financeLedgerChart, rawCode)
  ) {
    walletOperationFail("invalid_field");
  }
  const code = rawCode as FinanceLedgerAccountCode;
  const fields = readWalletOperationExactDataRecord(input, accountKeys(code));
  if (fields.currency !== "RUB") walletOperationFail("invalid_field");

  let normalized: unknown;
  switch (financeLedgerChart[code].scopeKind) {
    case "arc_provider_account":
      normalized = {
        code,
        arcProviderAccountId: normalizeWalletOperationIdentifier(fields.arcProviderAccountId),
        currency: "RUB"
      };
      break;
    case "arc_provider_account_and_bank_cash_pool":
      normalized = {
        code,
        arcProviderAccountId: normalizeWalletOperationIdentifier(fields.arcProviderAccountId),
        bankCashPoolId: normalizeWalletOperationIdentifier(fields.bankCashPoolId),
        currency: "RUB"
      };
      break;
    case "bank_cash_pool":
      normalized = {
        code,
        bankCashPoolId: normalizeWalletOperationIdentifier(fields.bankCashPoolId),
        currency: "RUB"
      };
      break;
    case "astrologer":
      normalized = {
        code,
        astrologerUserId: normalizeWalletOperationIdentifier(fields.astrologerUserId),
        currency: "RUB"
      };
      break;
    case "refund_and_payout":
      normalized = {
        code,
        refundId: normalizeWalletOperationIdentifier(fields.refundId),
        payoutRequestId: normalizeWalletOperationIdentifier(fields.payoutRequestId),
        currency: "RUB"
      };
      break;
    case "platform":
      normalized = { code, currency: "RUB" };
      break;
  }
  try {
    return createFinanceLedgerAccountRef(normalized);
  } catch {
    walletOperationFail("invalid_field");
  }
}

function accountKeys(code: FinanceLedgerAccountCode): readonly string[] {
  switch (financeLedgerChart[code].scopeKind) {
    case "arc_provider_account":
      return ["code", "arcProviderAccountId", "currency"];
    case "arc_provider_account_and_bank_cash_pool":
      return ["code", "arcProviderAccountId", "bankCashPoolId", "currency"];
    case "bank_cash_pool":
      return ["code", "bankCashPoolId", "currency"];
    case "astrologer":
      return ["code", "astrologerUserId", "currency"];
    case "refund_and_payout":
      return ["code", "refundId", "payoutRequestId", "currency"];
    case "platform":
      return ["code", "currency"];
  }
}
