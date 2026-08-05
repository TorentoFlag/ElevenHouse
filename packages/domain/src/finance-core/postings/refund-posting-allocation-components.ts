import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingMoney,
  readFinancePostingVersion
} from "./posting-codec";
import type {
  RefundAlreadyPaidComponent,
  RefundFundingReservationRef,
  RefundInFlightPayoutComponent,
  RefundPayableComponent,
  RefundPlatformCommissionComponent,
  RefundShortfallTreatment,
  RefundSourceAllocation
} from "./refund-posting-types";
import {
  readRefundPostingAuthorityRef,
  readRefundPostingMoney
} from "./refund-posting-value-codec";

export function readPayableComponent(input: unknown): RefundPayableComponent {
  const f = readExactDataRecord(input, [
    "kind",
    "componentId",
    "rootLotId",
    "sourceLotId",
    "refundPendingLotId",
    "originalBucket",
    "payoutAllocationId",
    "amount"
  ]);
  if (
    f.kind !== "payable_lot" ||
    !["pending", "available", "reserved"].includes(f.originalBucket as string)
  )
    fail("authority_mismatch");
  return Object.freeze({
    kind: "payable_lot",
    componentId: readFinancePostingIdentifier(f.componentId),
    rootLotId: readFinancePostingIdentifier(f.rootLotId),
    sourceLotId: readFinancePostingIdentifier(f.sourceLotId),
    refundPendingLotId: readFinancePostingIdentifier(f.refundPendingLotId),
    originalBucket: f.originalBucket as RefundPayableComponent["originalBucket"],
    payoutAllocationId: nullableId(f.payoutAllocationId),
    amount: readFinancePostingMoney(f.amount)
  });
}

export function readAlreadyPaidComponent(input: unknown): RefundAlreadyPaidComponent {
  const f = readExactDataRecord(input, [
    "kind",
    "componentId",
    "rootLotId",
    "payableLotId",
    "payoutRequestId",
    "payoutAllocationId",
    "payoutPaidAuthorityRef",
    "sourceAllocation",
    "fundingReservationRef",
    "treatment",
    "amount"
  ]);
  if (f.kind !== "already_paid") fail("authority_mismatch");
  return Object.freeze({
    kind: "already_paid",
    componentId: id(f.componentId),
    rootLotId: id(f.rootLotId),
    payableLotId: id(f.payableLotId),
    payoutRequestId: id(f.payoutRequestId),
    payoutAllocationId: id(f.payoutAllocationId),
    payoutPaidAuthorityRef: readRefundPostingAuthorityRef(f.payoutPaidAuthorityRef, [
      "payout_paid"
    ]),
    sourceAllocation: readSourceAllocation(f.sourceAllocation),
    fundingReservationRef: readReservation(f.fundingReservationRef),
    treatment: readTreatment(f.treatment),
    amount: readFinancePostingMoney(f.amount)
  });
}

export function readInFlightComponent(input: unknown): RefundInFlightPayoutComponent {
  const f = readExactDataRecord(input, [
    "kind",
    "componentId",
    "rootLotId",
    "payableLotId",
    "payoutRequestId",
    "payoutAllocationId",
    "payoutProcessingAuthorityRef",
    "bridgeAllocationRef",
    "bridgePolicyAuthorityRef",
    "sourceAllocation",
    "fundingReservationRef",
    "paidOutcomeTreatment",
    "amount"
  ]);
  if (f.kind !== "in_flight_payout") fail("authority_mismatch");
  return Object.freeze({
    kind: "in_flight_payout",
    componentId: id(f.componentId),
    rootLotId: id(f.rootLotId),
    payableLotId: id(f.payableLotId),
    payoutRequestId: id(f.payoutRequestId),
    payoutAllocationId: id(f.payoutAllocationId),
    payoutProcessingAuthorityRef: readRefundPostingAuthorityRef(f.payoutProcessingAuthorityRef, [
      "payout_processing_manual"
    ]),
    bridgeAllocationRef: readRefundPostingAuthorityRef(f.bridgeAllocationRef, [
      "refund_payout_bridge_allocation"
    ]),
    bridgePolicyAuthorityRef: readRefundPostingAuthorityRef(f.bridgePolicyAuthorityRef, [
      "refund_payout_bridge_policy"
    ]),
    sourceAllocation: readSourceAllocation(f.sourceAllocation),
    fundingReservationRef: readReservation(f.fundingReservationRef),
    paidOutcomeTreatment: readTreatment(f.paidOutcomeTreatment),
    amount: readFinancePostingMoney(f.amount)
  });
}

export function readPlatformComponent(input: unknown): RefundPlatformCommissionComponent {
  const f = readExactDataRecord(input, [
    "kind",
    "componentId",
    "sourceJournalTransactionId",
    "sourceJournalEntryIndex",
    "sourceAccountCode",
    "sourceEntryDigest",
    "sourceAllocation",
    "fundingReservationRef",
    "amount"
  ]);
  if (
    f.kind !== "platform_commission" ||
    (f.sourceAccountCode !== "platform_commission_deferred" &&
      f.sourceAccountCode !== "platform_commission_revenue") ||
    !Number.isSafeInteger(f.sourceJournalEntryIndex) ||
    (f.sourceJournalEntryIndex as number) < 0
  )
    fail("authority_mismatch");
  return Object.freeze({
    kind: "platform_commission",
    componentId: id(f.componentId),
    sourceJournalTransactionId: id(f.sourceJournalTransactionId),
    sourceJournalEntryIndex: f.sourceJournalEntryIndex as number,
    sourceAccountCode: f.sourceAccountCode,
    sourceEntryDigest: readFinancePostingDigest(f.sourceEntryDigest),
    sourceAllocation: readSourceAllocation(f.sourceAllocation),
    fundingReservationRef: readReservation(f.fundingReservationRef),
    amount: readFinancePostingMoney(f.amount)
  });
}

function readSourceAllocation(input: unknown): RefundSourceAllocation {
  const f = readExactDataRecord(input, [
    "sourceAmount",
    "priorAllocatedAmount",
    "nextAllocatedAmount"
  ]);
  return Object.freeze({
    sourceAmount: readFinancePostingMoney(f.sourceAmount),
    priorAllocatedAmount: readRefundPostingMoney(f.priorAllocatedAmount, false),
    nextAllocatedAmount: readFinancePostingMoney(f.nextAllocatedAmount)
  });
}

function readReservation(input: unknown): RefundFundingReservationRef {
  const f = readExactDataRecord(input, ["kind", "reservationId", "version", "canonicalDigest"]);
  if (f.kind !== "refund_funding_reservation") fail("authority_mismatch");
  return Object.freeze({
    kind: "refund_funding_reservation",
    reservationId: id(f.reservationId),
    version: readFinancePostingVersion(f.version),
    canonicalDigest: readFinancePostingDigest(f.canonicalDigest)
  });
}

function readTreatment(input: unknown): RefundShortfallTreatment {
  const f = readExactDataRecord(input, ["accountCode", "authorityRef"]);
  if (f.accountCode === "astrologer_recovery_receivable")
    return Object.freeze({
      accountCode: f.accountCode,
      authorityRef: readRefundPostingAuthorityRef(f.authorityRef, ["refund_recovery_allocation"])
    });
  if (f.accountCode === "platform_refund_loss")
    return Object.freeze({
      accountCode: f.accountCode,
      authorityRef: readRefundPostingAuthorityRef(f.authorityRef, [
        "refund_platform_loss_allocation"
      ])
    });
  return fail("authority_mismatch");
}

function nullableId(input: unknown): string | null {
  return input === null ? null : id(input);
}
function id(input: unknown): string {
  return readFinancePostingIdentifier(input);
}
function fail(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
