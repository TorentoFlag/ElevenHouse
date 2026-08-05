import { serializeFinanceSourceKey } from "./finance-source-key";
import { payableLotStateKeys } from "./source-lot-codec-shapes";
import { sameCanonicalValue } from "./source-lot-operation-receipt-core";
import { assertOperationShape } from "./source-lot-operation-receipt-shape";
import {
  hydrateLot,
  payableLotHistoryArray,
  rubCurrency,
  safeSourceKey,
  sha256Digest
} from "./source-lot-integrity";
import {
  PayableSourceLotIntegrityError,
  type PayableLotHistoryRecord,
  type PayableSourceLot
} from "./source-lot-types";
import {
  exactDataArray,
  exactDataRecord,
  fail,
  identifier,
  positiveVersion
} from "./source-lot-validation";

export const payableLotReceiptTransitionKeys = Object.freeze([
  "kind",
  "operationId",
  "sourceKey",
  "previousVersion",
  "nextVersion",
  "previousStateDigest",
  "nextStateDigest",
  "consumedLots",
  "createdLots",
  "historyRecord",
  "state"
] as const);

export type BoundedTransitionEvidence = Readonly<{
  kind: PayableLotHistoryRecord["kind"];
  operationId: string;
  sourceKey: PayableLotHistoryRecord["sourceKey"];
  previousVersion: number;
  nextVersion: number;
  previousStateDigest: string;
  nextStateDigest: string;
  consumedLots: readonly PayableSourceLot[];
  createdLots: readonly PayableSourceLot[];
  historyRecord: PayableLotHistoryRecord;
  astrologerUserId: string;
  currency: "RUB";
}>;

/**
 * Validates only the fixed transition envelope, touched lots, and latest
 * history record. It deliberately does not enumerate or hash the lifetime
 * state arrays; persisted/untrusted adjacency belongs to the rebuild oracle.
 */
export function canonicalBoundedTransition(input: unknown): BoundedTransitionEvidence {
  const fields = exactDataRecord(input, payableLotReceiptTransitionKeys);
  const kind = historyKind(fields.kind);
  const operationId = identifier(fields.operationId);
  const sourceKey = safeSourceKey(fields.sourceKey);
  const previousVersion = positiveVersion(fields.previousVersion, "invalid_field");
  const nextVersion = positiveVersion(fields.nextVersion, "invalid_field");
  const previousStateDigest = sha256Digest(fields.previousStateDigest);
  const nextStateDigest = sha256Digest(fields.nextStateDigest);
  const consumedLots = Object.freeze(exactDataArray(fields.consumedLots).map(hydrateLot));
  const createdLots = Object.freeze(exactDataArray(fields.createdLots).map(hydrateLot));
  const historyRecord = payableLotHistoryArray(Object.freeze([fields.historyRecord]))[0];
  if (!historyRecord) fail("invalid_shape");

  const stateFields = exactDataRecord(fields.state, payableLotStateKeys);
  const stateVersion = positiveVersion(stateFields.version, "invalid_field");
  const astrologerUserId = identifier(stateFields.astrologerUserId);
  const currency = rubCurrency(stateFields.currency);
  const stateDigest = sha256Digest(stateFields.stateDigest);
  const latestHistory = payableLotHistoryArray(
    Object.freeze([lastDataArrayEntry(stateFields.history)])
  )[0];

  if (
    nextVersion !== previousVersion + 1 ||
    stateVersion !== nextVersion ||
    stateDigest !== nextStateDigest ||
    historyRecord.kind !== kind ||
    historyRecord.operationId !== operationId ||
    serializeFinanceSourceKey(historyRecord.sourceKey) !== serializeFinanceSourceKey(sourceKey) ||
    historyRecord.previousVersion !== previousVersion ||
    historyRecord.nextVersion !== nextVersion ||
    !latestHistory ||
    !sameCanonicalValue(historyRecord, latestHistory) ||
    !sameIdentifierSequence(
      historyRecord.consumedLotIds,
      consumedLots.map((lot) => lot.lotId)
    ) ||
    !sameIdentifierSequence(
      historyRecord.createdLotIds,
      createdLots.map((lot) => lot.lotId)
    )
  ) {
    fail("lineage_invalid");
  }

  const allTouchedIds = [...consumedLots, ...createdLots].map((lot) => lot.lotId);
  if (new Set(allTouchedIds).size !== allTouchedIds.length) fail("lineage_invalid");
  for (const lot of consumedLots) {
    if (
      lot.status !== "consumed" ||
      lot.consumedByOperationId !== operationId ||
      lot.consumedAt !== historyRecord.occurredAt ||
      lot.astrologerUserId !== astrologerUserId ||
      lot.amount.currency !== currency
    ) {
      fail("lineage_invalid");
    }
  }
  for (const lot of createdLots) {
    if (
      lot.status !== "active" ||
      lot.createdByOperationId !== operationId ||
      lot.createdAt !== historyRecord.occurredAt ||
      lot.astrologerUserId !== astrologerUserId ||
      lot.amount.currency !== currency
    ) {
      fail("lineage_invalid");
    }
  }

  assertOperationShape(historyRecord, consumedLots, createdLots);
  return Object.freeze({
    kind,
    operationId,
    sourceKey,
    previousVersion,
    nextVersion,
    previousStateDigest,
    nextStateDigest,
    consumedLots,
    createdLots,
    historyRecord,
    astrologerUserId,
    currency
  });
}

function historyKind(value: unknown): PayableLotHistoryRecord["kind"] {
  if (
    value !== "sale_capture" &&
    value !== "hold_release" &&
    value !== "reserve_release" &&
    value !== "payout_requested" &&
    value !== "payout_released" &&
    value !== "payout_paid" &&
    value !== "payout_returned_reserved" &&
    value !== "refund_approved" &&
    value !== "refund_confirmed" &&
    value !== "refund_failed" &&
    value !== "refund_bridge_payout_failed" &&
    value !== "chargeback_confirmed" &&
    value !== "chargeback_principal_allocated" &&
    value !== "chargeback_recovery_collected" &&
    value !== "chargeback_won_reserved"
  ) {
    fail("invalid_field");
  }
  return value;
}

function lastDataArrayEntry(value: unknown): unknown {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      fail("invalid_shape");
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      !lengthDescriptor ||
      !("value" in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value <= 0
    ) {
      fail("invalid_shape");
    }
    const lastDescriptor = Object.getOwnPropertyDescriptor(
      value,
      String(lengthDescriptor.value - 1)
    );
    if (!lastDescriptor || !("value" in lastDescriptor) || lastDescriptor.enumerable !== true) {
      fail("invalid_shape");
    }
    return lastDescriptor.value;
  } catch (error) {
    if (error instanceof PayableSourceLotIntegrityError) throw error;
    return fail("invalid_shape");
  }
}

function sameIdentifierSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
