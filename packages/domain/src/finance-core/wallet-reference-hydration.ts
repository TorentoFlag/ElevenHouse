import { createFinanceSourceKey, type FinanceSourceKey } from "./finance-source-key";
import {
  createFinanceJournalTransaction,
  type FinanceJournalTransaction,
  type FinanceJournalTransactionInput
} from "./journal";
import {
  createPayableLotState,
  PayableSourceLotIntegrityError,
  projectPayableLotBuckets,
  type PayableLotBucketProjection,
  type PayableLotReferenceState
} from "./source-lots";
import {
  normalizePayableLotReceiptDecoderEnvelope,
  rehydratePayableLotOperationReceipt,
  type PayableLotOperationReceipt,
  type PayableLotReceiptDecoderEnvelope
} from "./source-lot-operation-receipt";
import { invalidWalletProjection } from "./wallet-reference-errors";
import type { StoredWalletSnapshot } from "./wallet-reference-types";
import {
  balanceString,
  exactDataArray,
  exactDataRecord,
  identifier,
  positiveDecimalString
} from "./wallet-reference-validation";

const inputKeys = [
  "astrologerUserId",
  "currency",
  "journalTransactions",
  "sourceLotState",
  "sourceOperationReceipts",
  "storedWallet"
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
const storedWalletKeys = [
  "walletId",
  "version",
  "astrologerUserId",
  "currency",
  "balances"
] as const;
const balanceKeys = [
  "pendingMinor",
  "availableMinor",
  "reservedMinor",
  "payoutPendingMinor",
  "refundPendingMinor",
  "recoveryReceivableMinor"
] as const;

export type HydratedWalletReferenceInput = Readonly<{
  astrologerUserId: string;
  journalTransactions: readonly FinanceJournalTransaction[];
  sourceLotState: PayableLotReferenceState;
  sourceOperationReceipts: readonly PayableLotOperationReceipt[];
  storedWallet: StoredWalletSnapshot;
  lotBalances: PayableLotBucketProjection;
}>;

export function hydrateWalletReferenceInput(
  input: unknown,
  receiptDecoderEnvelopeInput: unknown
): HydratedWalletReferenceInput {
  const receiptDecoderEnvelope = normalizePayableLotReceiptDecoderEnvelope(
    receiptDecoderEnvelopeInput
  );
  const fields = exactDataRecord(input, inputKeys);
  const astrologerUserId = identifier(fields.astrologerUserId);
  if (fields.currency !== "RUB") invalidWalletProjection();
  const journalTransactions = journalArray(fields.journalTransactions);
  const sourceOperationReceipts = receiptArray(
    fields.sourceOperationReceipts,
    receiptDecoderEnvelope
  );
  const storedWallet = hydrateStoredWallet(fields.storedWallet);
  if (
    storedWallet.astrologerUserId !== astrologerUserId ||
    storedWallet.currency !== fields.currency
  ) {
    invalidWalletProjection();
  }

  let sourceLotState: PayableLotReferenceState;
  try {
    sourceLotState = createPayableLotState(fields.sourceLotState);
  } catch (error) {
    if (error instanceof PayableSourceLotIntegrityError) invalidWalletProjection();
    throw error;
  }
  if (
    sourceLotState.astrologerUserId !== astrologerUserId ||
    sourceLotState.currency !== fields.currency
  ) {
    invalidWalletProjection();
  }
  const lotBalances = projectPayableLotBuckets({
    state: sourceLotState,
    astrologerUserId,
    currency: "RUB"
  });

  return Object.freeze({
    astrologerUserId,
    journalTransactions,
    sourceLotState,
    sourceOperationReceipts,
    storedWallet,
    lotBalances
  });
}

function journalArray(value: unknown): readonly FinanceJournalTransaction[] {
  return Object.freeze(exactDataArray(value).map((transaction) => hydrateJournal(transaction)));
}

function receiptArray(
  value: unknown,
  decoderEnvelope: PayableLotReceiptDecoderEnvelope
): readonly PayableLotOperationReceipt[] {
  try {
    return Object.freeze(
      exactDataArray(value).map((receipt) =>
        rehydratePayableLotOperationReceipt(receipt, decoderEnvelope)
      )
    );
  } catch (error) {
    if (error instanceof PayableSourceLotIntegrityError) return invalidWalletProjection();
    throw error;
  }
}

function hydrateJournal(value: unknown): FinanceJournalTransaction {
  const fields = exactDataRecord(value, journalKeys);
  let sourceKey: FinanceSourceKey;
  try {
    sourceKey = createFinanceSourceKey(fields.sourceKey);
  } catch {
    return invalidWalletProjection();
  }
  let canonical: FinanceJournalTransaction;
  try {
    canonical = createFinanceJournalTransaction({
      id: fields.id,
      sourceKey,
      occurredAt: fields.occurredAt,
      postedAt: fields.postedAt,
      reversesTransactionId: fields.reversesTransactionId,
      entries: fields.entries
    } as FinanceJournalTransactionInput);
  } catch {
    return invalidWalletProjection();
  }
  if (
    fields.currency !== canonical.currency ||
    fields.totalDebitMinor !== canonical.totalDebitMinor ||
    fields.totalCreditMinor !== canonical.totalCreditMinor
  ) {
    invalidWalletProjection();
  }
  return canonical;
}

function hydrateStoredWallet(value: unknown): StoredWalletSnapshot {
  const fields = exactDataRecord(value, storedWalletKeys);
  const balances = exactDataRecord(fields.balances, balanceKeys);
  return Object.freeze({
    walletId: identifier(fields.walletId),
    version: positiveDecimalString(fields.version),
    astrologerUserId: identifier(fields.astrologerUserId),
    currency: fields.currency === "RUB" ? "RUB" : invalidWalletProjection(),
    balances: Object.freeze({
      pendingMinor: balanceString(balances.pendingMinor),
      availableMinor: balanceString(balances.availableMinor),
      reservedMinor: balanceString(balances.reservedMinor),
      payoutPendingMinor: balanceString(balances.payoutPendingMinor),
      refundPendingMinor: balanceString(balances.refundPendingMinor),
      recoveryReceivableMinor: balanceString(balances.recoveryReceivableMinor)
    })
  });
}
