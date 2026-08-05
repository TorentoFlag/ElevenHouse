import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingVersion,
  readOwnDataDiscriminator
} from "./posting-codec";
import type {
  RefundFundingPositionRef,
  RefundFundingReservationAuthorityBinding,
  RefundFundingReservationAuthorityRef,
  RefundFundingSourceIdentity,
  RefundFundingTransitionBindingRef
} from "./refund-funding-position-types";

export function readRefundFundingSource(input: unknown): RefundFundingSourceIdentity {
  const kind = readOwnDataDiscriminator(input, "kind", [
    "payable_root_lot",
    "paid_payout_allocation",
    "in_flight_payout_allocation",
    "platform_journal_entry"
  ] as const);
  if (kind === "payable_root_lot") {
    const fields = readExactDataRecord(input, ["kind", "orderId", "rootLotId"]);
    return Object.freeze({
      kind,
      orderId: id(fields.orderId),
      rootLotId: id(fields.rootLotId)
    });
  }
  if (kind === "paid_payout_allocation" || kind === "in_flight_payout_allocation") {
    const fields = readExactDataRecord(input, [
      "kind",
      "orderId",
      "rootLotId",
      "payableLotId",
      "payoutRequestId",
      "payoutAllocationId"
    ]);
    return Object.freeze({
      kind,
      orderId: id(fields.orderId),
      rootLotId: id(fields.rootLotId),
      payableLotId: id(fields.payableLotId),
      payoutRequestId: id(fields.payoutRequestId),
      payoutAllocationId: id(fields.payoutAllocationId)
    });
  }
  const fields = readExactDataRecord(input, [
    "kind",
    "orderId",
    "transactionId",
    "entryIndex",
    "accountCode"
  ]);
  if (
    !Number.isSafeInteger(fields.entryIndex) ||
    (fields.entryIndex as number) < 0 ||
    (fields.accountCode !== "platform_commission_deferred" &&
      fields.accountCode !== "platform_commission_revenue")
  ) {
    mismatch();
  }
  return Object.freeze({
    kind,
    orderId: id(fields.orderId),
    transactionId: id(fields.transactionId),
    entryIndex: fields.entryIndex as number,
    accountCode: fields.accountCode
  });
}

export function readRefundFundingReservationAuthorityRef(
  input: unknown
): RefundFundingReservationAuthorityRef {
  const kind = readOwnDataDiscriminator(input, "kind", [
    "payable_lot_operation_receipt",
    "refund_funding_reservation"
  ] as const);
  if (kind === "payable_lot_operation_receipt") {
    const fields = readExactDataRecord(input, ["kind", "evidenceId", "canonicalDigest"]);
    return Object.freeze({
      kind,
      evidenceId: id(fields.evidenceId),
      canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
    });
  }
  const fields = readExactDataRecord(input, [
    "kind",
    "reservationId",
    "version",
    "canonicalDigest"
  ]);
  return Object.freeze({
    kind,
    reservationId: id(fields.reservationId),
    version: readFinancePostingVersion(fields.version),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

export function readRefundFundingReservationAuthorityBinding(
  input: unknown
): RefundFundingReservationAuthorityBinding {
  const fields = readExactDataRecord(input, ["componentId", "sourcePositionId", "reference"]);
  return Object.freeze({
    componentId: id(fields.componentId),
    sourcePositionId: id(fields.sourcePositionId),
    reference: readRefundFundingReservationAuthorityRef(fields.reference)
  });
}

export function readRefundFundingPositionRef(input: unknown): RefundFundingPositionRef {
  const fields = readExactDataRecord(input, ["kind", "positionId", "version", "canonicalDigest"]);
  if (fields.kind !== "unverified_refund_funding_position") mismatch();
  return Object.freeze({
    kind: "unverified_refund_funding_position" as const,
    positionId: id(fields.positionId),
    version: nonnegativeVersion(fields.version),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

export function readRefundFundingTransitionBindingRef(
  input: unknown
): RefundFundingTransitionBindingRef {
  const fields = readExactDataRecord(input, ["kind", "bindingId", "operation", "canonicalDigest"]);
  if (
    fields.kind !== "unverified_refund_funding_transition_binding" ||
    (fields.operation !== "approved" &&
      fields.operation !== "confirmed" &&
      fields.operation !== "failed")
  ) {
    mismatch();
  }
  return Object.freeze({
    kind: "unverified_refund_funding_transition_binding" as const,
    bindingId: id(fields.bindingId),
    operation: fields.operation,
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

function nonnegativeVersion(input: unknown): number {
  if (!Number.isSafeInteger(input) || (input as number) < 0) mismatch();
  return input as number;
}

function id(input: unknown): string {
  return readFinancePostingIdentifier(input);
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
