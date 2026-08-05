import { scopedLots } from "./source-lot-integrity";
import { rebuildPayableLotReferenceState } from "./source-lot-reference";
import { type PayableLotBucket, type PayableLotBucketProjection } from "./source-lot-types";
import { exactDataRecord, fail, identifier } from "./source-lot-validation";
export function projectPayableLotBuckets(input: unknown): PayableLotBucketProjection {
  const fields = exactDataRecord(input, ["state", "astrologerUserId", "currency"]);
  const state = rebuildPayableLotReferenceState(fields.state);
  const astrologerUserId = identifier(fields.astrologerUserId);
  if (fields.currency !== "RUB") fail("owner_currency_mismatch");
  if (state.astrologerUserId !== astrologerUserId) fail("owner_currency_mismatch");
  const lots = scopedLots(state.lots, astrologerUserId, "RUB");
  const totals: Record<PayableLotBucket, bigint> = {
    pending: 0n,
    available: 0n,
    reserved: 0n,
    payout_pending: 0n,
    refund_pending: 0n
  };
  for (const lot of lots) {
    if (lot.status === "active") totals[lot.bucket] += BigInt(lot.amount.amountMinor);
  }
  return Object.freeze({
    pendingMinor: totals.pending.toString(),
    availableMinor: totals.available.toString(),
    reservedMinor: totals.reserved.toString(),
    payoutPendingMinor: totals.payout_pending.toString(),
    refundPendingMinor: totals.refund_pending.toString()
  });
}
