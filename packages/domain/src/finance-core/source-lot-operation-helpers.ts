import type { PayableLotReferenceState, PayableSourceLot } from "./source-lot-types";
import {
  exactDataArray,
  exactDataRecord,
  fail,
  identifier,
  integer,
  nullableIdentifier
} from "./source-lot-validation";

export function hasUnresolvedRefundForOrder(
  state: PayableLotReferenceState,
  orderId: string
): boolean {
  return state.history.some((record) => {
    if (record.authority?.kind !== "refund_approval" || record.authority.orderId !== orderId) {
      return false;
    }
    const refundId = record.authority.refundId;
    return !state.history.some(
      (candidate) =>
        (candidate.authority?.kind === "refund_confirmed" ||
          candidate.authority?.kind === "refund_failed") &&
        candidate.authority.refundId === refundId
    );
  });
}

export function exactRequestedLotAmounts(value: unknown, allowEmpty = false) {
  const requests = exactDataArray(value).map((entry) => {
    const fields = exactDataRecord(entry, ["lotId", "amountMinor"]);
    return Object.freeze({
      lotId: identifier(fields.lotId),
      amountMinor: integer(fields.amountMinor, 1, Number.MAX_SAFE_INTEGER, "invalid_field")
    });
  });
  if (
    (!allowEmpty && requests.length === 0) ||
    new Set(requests.map((request) => request.lotId)).size !== requests.length
  ) {
    fail("selection_mismatch");
  }
  return Object.freeze(requests);
}

export function partialLotRemainderOutputs(
  value: unknown,
  requests: readonly { readonly lotId: string; readonly amountMinor: number }[],
  existingLots: readonly PayableSourceLot[]
): ReadonlyMap<string, string | null> {
  const rows = exactDataArray(value).map((entry) => {
    const fields = exactDataRecord(entry, ["sourceLotId", "remainderLotId"]);
    return Object.freeze({
      sourceLotId: identifier(fields.sourceLotId),
      remainderLotId: nullableIdentifier(fields.remainderLotId)
    });
  });
  if (
    rows.length !== requests.length ||
    new Set(rows.map((row) => row.sourceLotId)).size !== rows.length ||
    rows.some((row) => !requests.some((request) => request.lotId === row.sourceLotId))
  ) {
    fail("selection_mismatch");
  }
  const newIds = rows
    .map((row) => row.remainderLotId)
    .filter((lotId): lotId is string => lotId !== null);
  if (
    new Set(newIds).size !== newIds.length ||
    newIds.some((lotId) => existingLots.some((lot) => lot.lotId === lotId))
  ) {
    fail("duplicate_lot_id");
  }
  return new Map(rows.map((row) => [row.sourceLotId, row.remainderLotId] as const));
}
