import type { PayableLotReceiptEffectBucket } from "./source-lot-operation-receipt-types";
import type { PayableLotBucket, PayableLotHistoryRecord } from "./source-lot-types";
import { fail } from "./source-lot-validation";

export function positiveReceiptVersion(value: unknown, maxDecimalDigits: number): string {
  if (!Number.isSafeInteger(maxDecimalDigits) || maxDecimalDigits < 1) fail("invalid_shape");
  if (typeof value !== "string" || value.length > maxDecimalDigits || !/^[1-9]\d*$/.test(value)) {
    fail("invalid_field");
  }
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) fail("invalid_field");
  return value;
}

export function receiptEffectBucket(value: unknown, allowRecovery: false): PayableLotBucket;
export function receiptEffectBucket(
  value: unknown,
  allowRecovery?: true
): PayableLotReceiptEffectBucket;
export function receiptEffectBucket(
  value: unknown,
  allowRecovery = true
): PayableLotReceiptEffectBucket {
  if (
    value !== "pending" &&
    value !== "available" &&
    value !== "reserved" &&
    value !== "payout_pending" &&
    value !== "refund_pending" &&
    (allowRecovery === false || value !== "recovery_receivable")
  ) {
    fail("invalid_field");
  }
  return value;
}

export function receiptHistoryKind(value: unknown): PayableLotHistoryRecord["kind"] {
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
