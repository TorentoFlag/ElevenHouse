import {
  allocateChargebackPrincipalPayableLots,
  collectChargebackRecoveryPayableLots,
  confirmChargebackRestriction,
  confirmRefundPayableLots,
  consumePaidPayoutPayableLots,
  consumeRefundBridgeFailedPayoutLots,
  createChargebackConfirmedAuthority,
  createChargebackPrincipalAllocationAuthority,
  createChargebackRecoveryCollectionAuthority,
  createChargebackWonAuthority,
  createEmptyPayableLotReferenceState,
  createPayoutNoTransferOutcomeAuthority,
  createPayoutPaidAuthority,
  createPayoutRequestAuthority,
  createPayoutReturnAuthority,
  createRefundBridgePayoutFailedAuthority,
  createReserveReleaseAuthority,
  createReturnedPayoutReservedPayableLots,
  failRefundPayableLots,
  movePayoutSelectionToPending,
  releasePayoutPendingPayableLots,
  releasePendingPayableLotFromState,
  releaseReservedPayableLots,
  restoreChargebackWonReservedPayableLots,
  selectPayoutPayableLots,
  type PayableLotHistoryRecord,
  type PayableLotReferenceState,
  type PayableLotReferenceStateTransition
} from "./source-lots";
import {
  blockSnapshot,
  paymentIntegrity,
  releaseFixture
} from "./source-lot-sale-hold-test-fixtures";
import {
  chargebackPrincipalConfirmedBasis,
  chargebackRestrictedState,
  confirmedRefundAuthority,
  failedRefundAuthority,
  payoutPendingState as refundBridgePayoutPendingState,
  refundPendingState,
  releasedState
} from "./source-lot-reference-test-fixtures";

export type ReceiptTransitionCase = Readonly<{
  kind: PayableLotHistoryRecord["kind"];
  previousState: PayableLotReferenceState;
  transition: PayableLotReferenceStateTransition;
  expectedEffects: readonly Readonly<{
    side: "debit" | "credit";
    bucket:
      | "pending"
      | "available"
      | "reserved"
      | "payout_pending"
      | "refund_pending"
      | "recovery_receivable";
    amountMinor: number;
  }>[];
}>;

export function buildReceiptTransitionCases(): readonly ReceiptTransitionCase[] {
  const saleHold = saleHoldTransitions();
  const payout = payoutTransitions(saleHold.hold);
  const refund = refundTransitions();
  const bridge = refundBridgeTransition();
  const chargeback = chargebackTransitions();

  return Object.freeze([
    receiptCase(saleHold.initial, saleHold.sale, [credit("pending", 9_600)]),
    receiptCase(saleHold.sale.state, saleHold.hold, [
      debit("pending", 9_600),
      credit("available", 8_640),
      credit("reserved", 960)
    ]),
    receiptCase(saleHold.hold.state, payout.reserveReleased, [
      debit("reserved", 960),
      credit("available", 960)
    ]),
    receiptCase(payout.reserveReleased.state, payout.requested, [
      debit("available", 8_640),
      debit("available", 360),
      credit("payout_pending", 8_640),
      credit("payout_pending", 360)
    ]),
    receiptCase(payout.requested.state, payout.released, [
      debit("payout_pending", 8_640),
      debit("payout_pending", 360),
      credit("available", 8_640),
      credit("available", 360)
    ]),
    receiptCase(payout.requested.state, payout.paid, [
      debit("payout_pending", 8_640),
      debit("payout_pending", 360)
    ]),
    receiptCase(payout.paid.state, payout.returned, [
      credit("reserved", 8_640),
      credit("reserved", 360)
    ]),
    receiptCase(refund.approvedPrevious, refund.approved, [
      debit("available", 1_500),
      debit("reserved", 500),
      credit("refund_pending", 1_500),
      credit("refund_pending", 500)
    ]),
    receiptCase(refund.confirmedPrevious, refund.confirmed, [
      debit("refund_pending", 1_500),
      debit("refund_pending", 500)
    ]),
    receiptCase(refund.failedPrevious, refund.failed, [
      debit("refund_pending", 1_500),
      debit("refund_pending", 500),
      credit("available", 1_500),
      credit("reserved", 500)
    ]),
    receiptCase(bridge.previousState, bridge.transition, [debit("payout_pending", 400)]),
    receiptCase(chargeback.confirmedPrevious, chargeback.confirmed, []),
    receiptCase(chargeback.allocatedPrevious, chargeback.allocated, [debit("available", 2_000)]),
    receiptCase(chargeback.recoveryPrevious, chargeback.recovery, [
      debit("available", 500),
      credit("recovery_receivable", 500)
    ]),
    receiptCase(chargeback.wonPrevious, chargeback.won, [credit("reserved", 1_500)])
  ]);
}

function saleHoldTransitions() {
  const initial = createEmptyPayableLotReferenceState({
    astrologerUserId: "astrologer-1",
    currency: "RUB"
  });
  const fixture = releaseFixture("order-receipt-payout", { initialState: initial });
  const hold = releasePendingPayableLotFromState(fixture.input);
  return { initial, sale: fixture.transition, hold };
}

function payoutTransitions(hold: PayableLotReferenceStateTransition) {
  const releasedAt = "2026-09-03T10:00:00Z";
  const reserveReleased = releaseReservedPayableLots({
    state: hold.state,
    expectedVersion: hold.nextVersion,
    lotIds: ["lot-order-receipt-payout-reserved"],
    paymentIntegrity: paymentIntegrity("order-receipt-payout", "capture_clear", releasedAt),
    blocks: blockSnapshot("order-receipt-payout", {}, releasedAt),
    authority: createReserveReleaseAuthority({
      kind: "reserve_release",
      authorityId: "receipt-reserve-release-authority",
      version: 1,
      holdReleaseOperationId: "hold-release-order-receipt-payout",
      reserveDecisionId: "reserve-decision-order-receipt-payout",
      reserveDecisionVersion: 1
    }),
    operationId: "receipt-reserve-release",
    sourceKey: {
      kind: "reserve",
      sourceId: "receipt-reserve-release",
      operation: "released"
    },
    evaluatedAt: releasedAt,
    outputLotIds: [
      {
        sourceLotId: "lot-order-receipt-payout-reserved",
        targetLotId: "receipt-reserve-available"
      }
    ]
  });
  const selection = selectPayoutPayableLots({
    state: reserveReleased.state,
    expectedVersion: reserveReleased.nextVersion,
    astrologerUserId: "astrologer-1",
    amount: { amountMinor: 9_000, currency: "RUB" }
  });
  const requestAuthority = createPayoutRequestAuthority({
    kind: "payout_request",
    authorityId: "receipt-payout-request-authority",
    version: 1,
    payoutRequestId: "receipt-payout",
    astrologerUserId: "astrologer-1",
    amount: { amountMinor: 9_000, currency: "RUB" },
    allocations: [
      {
        payoutAllocationId: "receipt-payout-allocation-available",
        sourceLotId: "lot-order-receipt-payout-available",
        payoutPendingLotId: "receipt-payout-from-available",
        amountMinor: 8_640
      },
      {
        payoutAllocationId: "receipt-payout-allocation-reserve",
        sourceLotId: "receipt-reserve-available",
        payoutPendingLotId: "receipt-payout-from-reserve",
        amountMinor: 360
      }
    ]
  });
  const requested = movePayoutSelectionToPending({
    state: reserveReleased.state,
    expectedVersion: reserveReleased.nextVersion,
    selection,
    authority: requestAuthority,
    payoutRequestId: "receipt-payout",
    operationId: "receipt-payout-requested",
    sourceKey: { kind: "payout", sourceId: "receipt-payout", operation: "requested" },
    occurredAt: "2026-09-04T00:00:00Z",
    outputLotIds: [
      {
        sourceLotId: "lot-order-receipt-payout-available",
        targetLotId: "receipt-payout-from-available",
        remainderLotId: null
      },
      {
        sourceLotId: "receipt-reserve-available",
        targetLotId: "receipt-payout-from-reserve",
        remainderLotId: "receipt-payout-available-remainder"
      }
    ]
  });
  const released = releasePayoutPendingPayableLots({
    state: requested.state,
    expectedVersion: requested.nextVersion,
    payoutRequestId: "receipt-payout",
    authority: createPayoutNoTransferOutcomeAuthority({
      kind: "payout_no_transfer_outcome",
      authorityId: "receipt-payout-no-transfer-authority",
      version: 1,
      payoutRequestId: "receipt-payout",
      outcome: "failed_pre_transfer",
      bankInitiation: "not_started",
      bankDebit: "not_possible",
      evidenceId: "receipt-payout-no-transfer-evidence",
      decidedAt: "2026-09-04T01:00:00Z"
    }),
    operationId: "receipt-payout-released",
    sourceKey: { kind: "payout", sourceId: "receipt-payout", operation: "released" },
    occurredAt: "2026-09-04T01:00:00Z",
    outputLotIds: [
      {
        sourceLotId: "receipt-payout-from-available",
        targetLotId: "receipt-payout-released-available-1"
      },
      {
        sourceLotId: "receipt-payout-from-reserve",
        targetLotId: "receipt-payout-released-available-2"
      }
    ]
  });
  const paid = consumePaidPayoutPayableLots({
    state: requested.state,
    expectedVersion: requested.nextVersion,
    payoutRequestId: "receipt-payout",
    authority: createPayoutPaidAuthority({
      kind: "payout_paid",
      authorityId: "receipt-payout-paid-authority",
      version: 1,
      payoutRequestId: "receipt-payout",
      bankReference: "receipt-bank-reference",
      transferredAt: "2026-09-04T02:00:00Z",
      evidenceRef: "private://receipt-payout-proof",
      evidenceHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }),
    operationId: "receipt-payout-paid",
    sourceKey: { kind: "payout", sourceId: "receipt-payout", operation: "paid" },
    occurredAt: "2026-09-04T02:00:00Z"
  });
  const returned = createReturnedPayoutReservedPayableLots({
    state: paid.state,
    expectedVersion: paid.nextVersion,
    payoutRequestId: "receipt-payout",
    authority: createPayoutReturnAuthority({
      kind: "payout_return",
      authorityId: "receipt-payout-return-authority",
      version: 1,
      payoutRequestId: "receipt-payout",
      outcome: "returned_without_debit",
      bankReference: "receipt-bank-reference",
      bankStatementEntryId: null,
      bankCreditEvidencePath: null,
      suspenseReclassificationId: null,
      returnedAt: "2026-09-05T00:00:00Z",
      evidenceId: "receipt-payout-return-evidence"
    }),
    operationId: "receipt-payout-returned",
    sourceKey: {
      kind: "payout",
      sourceId: "receipt-payout",
      operation: "returned_without_debit"
    },
    occurredAt: "2026-09-05T00:00:00Z",
    outputLotIds: [
      {
        sourceLotId: "receipt-payout-from-available",
        targetLotId: "receipt-payout-returned-reserved-1"
      },
      {
        sourceLotId: "receipt-payout-from-reserve",
        targetLotId: "receipt-payout-returned-reserved-2"
      }
    ]
  });
  return { reserveReleased, requested, released, paid, returned };
}

function refundTransitions() {
  const confirmedBase = refundPendingState();
  const confirmed = confirmRefundPayableLots({
    state: confirmedBase.moved.state,
    expectedVersion: confirmedBase.moved.nextVersion,
    refundId: "refund-1",
    authority: confirmedRefundAuthority(),
    operationId: "receipt-refund-confirmed",
    sourceKey: { kind: "refund", sourceId: "refund-1", operation: "confirmed" },
    occurredAt: "2026-08-05T00:00:00Z"
  });
  const failedBase = refundPendingState();
  const failed = failRefundPayableLots({
    state: failedBase.moved.state,
    expectedVersion: failedBase.moved.nextVersion,
    refundId: "refund-1",
    authority: failedRefundAuthority(),
    operationId: "receipt-refund-failed",
    sourceKey: { kind: "refund", sourceId: "refund-1", operation: "failed" },
    occurredAt: "2026-08-05T00:00:00Z",
    outputLotIds: [
      {
        sourceLotId: "refund-1-from-available",
        targetLotId: "receipt-refund-restored-available"
      },
      {
        sourceLotId: "refund-1-from-reserved",
        targetLotId: "receipt-refund-restored-reserved"
      }
    ]
  });
  return {
    approvedPrevious: confirmedBase.released.state,
    approved: confirmedBase.moved,
    confirmedPrevious: confirmedBase.moved.state,
    confirmed,
    failedPrevious: failedBase.moved.state,
    failed
  };
}

function refundBridgeTransition() {
  const base = refundBridgePayoutPendingState();
  const authority = createRefundBridgePayoutFailedAuthority({
    kind: "refund_bridge_payout_failed",
    authorityId: "receipt-refund-bridge-failed-authority",
    version: 1,
    refundId: "refund-bridge-1",
    refundedOrderId: "order-bridge",
    payoutRequestId: "payout-bridge",
    payoutAllocationId: "payout-bridge-allocation",
    amount: { amountMinor: 400, currency: "RUB" },
    bridgeAllocationId: "receipt-bridge-allocation",
    bridgeAllocationVersion: 1,
    bridgeStatus: "allocated",
    accountingAllocationId: "refund-accounting-allocation-bridge",
    accountingAllocationVersion: 1,
    confirmedRefundAuthorityId: "refund-bridge-confirmed-authority",
    confirmedRefundAuthorityVersion: 1,
    confirmedRefundEvidenceId: "refund-bridge-confirmed-evidence",
    payoutOutcomeAuthority: createPayoutNoTransferOutcomeAuthority({
      kind: "payout_no_transfer_outcome",
      authorityId: "receipt-payout-no-transfer-authority-bridge",
      version: 1,
      payoutRequestId: "payout-bridge",
      outcome: "failed_pre_transfer",
      bankInitiation: "not_started",
      bankDebit: "not_possible",
      evidenceId: "receipt-payout-no-transfer-evidence-bridge",
      decidedAt: "2026-08-04T01:00:00Z"
    })
  });
  const transition = consumeRefundBridgeFailedPayoutLots({
    state: base.state,
    expectedVersion: base.nextVersion,
    authority,
    requestedLots: [{ lotId: "payout-bridge-pending", amountMinor: 400 }],
    operationId: "receipt-refund-bridge-payout-failed",
    sourceKey: {
      kind: "refund",
      sourceId: "receipt-bridge-allocation",
      operation: "bridge_payout_failed"
    },
    occurredAt: "2026-08-04T01:00:00Z",
    outputLotIds: [
      {
        sourceLotId: "payout-bridge-pending",
        remainderLotId: "receipt-payout-bridge-unaffected"
      }
    ]
  });
  return { previousState: base.state, transition };
}

function chargebackTransitions() {
  const base = chargebackRestrictedState();
  const allocated = allocateChargebackPrincipalPayableLots({
    state: base.restricted.state,
    expectedVersion: base.restricted.nextVersion,
    authority: createChargebackPrincipalAllocationAuthority({
      kind: "chargeback_principal_allocation",
      authorityId: "receipt-chargeback-principal-authority",
      version: 1,
      chargebackCaseId: "chargeback-1",
      orderId: "order-chargeback",
      astrologerUserId: "astrologer-1",
      payableAmount: { amountMinor: 2_000, currency: "RUB" },
      accountingAllocationId: "receipt-chargeback-allocation",
      accountingAllocationRevisionId: "receipt-chargeback-allocation-revision-1",
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      confirmedBasis: chargebackPrincipalConfirmedBasis(base.restricted.state, "chargeback-1")
    }),
    requestedLots: [{ lotId: "lot-order-chargeback-available", amountMinor: 2_000 }],
    operationId: "receipt-chargeback-principal-allocated",
    sourceKey: {
      kind: "chargeback",
      sourceId: "receipt-chargeback-allocation-revision-1",
      operation: "principal_allocated"
    },
    occurredAt: "2026-08-04T01:00:00Z",
    outputLotIds: [
      {
        sourceLotId: "lot-order-chargeback-available",
        remainderLotId: "receipt-chargeback-available-remainder"
      }
    ]
  });
  const won = restoreChargebackWonReservedPayableLots({
    state: allocated.state,
    expectedVersion: allocated.nextVersion,
    authority: createChargebackWonAuthority({
      kind: "chargeback_won",
      authorityId: "receipt-chargeback-won-authority",
      version: 1,
      chargebackCaseId: "chargeback-1",
      restoredPayableAmount: { amountMinor: 1_500, currency: "RUB" },
      suspenseClearedAmount: { amountMinor: 500, currency: "RUB" },
      accountingAllocationId: "receipt-chargeback-win-allocation",
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      canonicalEvidenceId: "receipt-chargeback-won-evidence",
      wonAt: "2026-08-10T00:00:00Z"
    }),
    requestedLots: [{ lotId: "lot-order-chargeback-available", amountMinor: 1_500 }],
    operationId: "receipt-chargeback-won",
    sourceKey: { kind: "chargeback", sourceId: "chargeback-1", operation: "won" },
    occurredAt: "2026-08-10T00:00:00Z",
    outputLotIds: [
      {
        sourceLotId: "lot-order-chargeback-available",
        targetLotId: "receipt-chargeback-won-reserved"
      }
    ]
  });

  const disputed = releasedState("order-receipt-disputed");
  const withRecoveryOrder = releasedState("order-receipt-recovery", disputed.state);
  const recoveryRestricted = confirmChargebackRestriction({
    state: withRecoveryOrder.state,
    expectedVersion: withRecoveryOrder.nextVersion,
    authority: createChargebackConfirmedAuthority({
      kind: "chargeback_confirmed",
      authorityId: "receipt-recovery-confirmed-authority",
      version: 1,
      confirmationId: "receipt-recovery-confirmation",
      restrictionId: "receipt-recovery-restriction",
      confirmationKind: "initial",
      amountBasis: "cumulative",
      priorRestrictionVersion: null,
      chargebackCaseId: "receipt-recovery-case",
      orderId: "order-receipt-disputed",
      astrologerUserId: "astrologer-1",
      providerAccount: {
        seriesId: "arc-series-live",
        providerAccountId: "arc-account-live",
        identityVersion: 1
      },
      providerPaymentId: "provider-payment-order-receipt-disputed",
      priorCumulativeDisputedAmount: { amountMinor: 0, currency: "RUB" },
      nextCumulativeDisputedAmount: { amountMinor: 5_000, currency: "RUB" },
      disputedDelta: { amountMinor: 5_000, currency: "RUB" },
      canonicalEvidenceId: "receipt-recovery-confirmed-evidence",
      confirmedAt: "2026-08-04T00:00:00Z"
    }),
    operationId: "receipt-recovery-confirmed",
    sourceKey: {
      kind: "chargeback",
      sourceId: "receipt-recovery-confirmation",
      operation: "confirmed"
    },
    occurredAt: "2026-08-04T00:00:00Z"
  });
  const recovery = collectChargebackRecoveryPayableLots({
    state: recoveryRestricted.state,
    expectedVersion: recoveryRestricted.nextVersion,
    authority: createChargebackRecoveryCollectionAuthority({
      kind: "chargeback_recovery_collection",
      authorityId: "receipt-recovery-collection-authority",
      version: 1,
      recoveryCollectionId: "receipt-recovery-collection",
      chargebackCaseId: "receipt-recovery-case",
      astrologerUserId: "astrologer-1",
      collectionSource: {
        kind: "future_payable",
        sourceOrderId: "order-receipt-recovery"
      },
      collectedPayableAmount: { amountMinor: 500, currency: "RUB" },
      accountingAllocationId: "receipt-recovery-accounting-allocation",
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      canonicalEvidenceId: "receipt-recovery-collection-evidence",
      collectedAt: "2026-08-06T00:00:00Z"
    }),
    requestedLots: [{ lotId: "lot-order-receipt-recovery-available", amountMinor: 500 }],
    operationId: "receipt-recovery-collected",
    sourceKey: {
      kind: "chargeback",
      sourceId: "receipt-recovery-collection",
      operation: "recovery_collected"
    },
    occurredAt: "2026-08-06T00:00:00Z",
    outputLotIds: [
      {
        sourceLotId: "lot-order-receipt-recovery-available",
        remainderLotId: "receipt-recovery-available-remainder"
      }
    ]
  });
  return {
    confirmedPrevious: base.released.state,
    confirmed: base.restricted,
    allocatedPrevious: base.restricted.state,
    allocated,
    recoveryPrevious: recoveryRestricted.state,
    recovery,
    wonPrevious: allocated.state,
    won
  };
}

function receiptCase(
  previousState: PayableLotReferenceState,
  transition: PayableLotReferenceStateTransition,
  expectedEffects: ReceiptTransitionCase["expectedEffects"]
): ReceiptTransitionCase {
  return Object.freeze({
    kind: transition.kind,
    previousState,
    transition,
    expectedEffects: Object.freeze(expectedEffects)
  });
}

function debit(
  bucket: ReceiptTransitionCase["expectedEffects"][number]["bucket"],
  amountMinor: number
) {
  return Object.freeze({ side: "debit" as const, bucket, amountMinor });
}

function credit(
  bucket: ReceiptTransitionCase["expectedEffects"][number]["bucket"],
  amountMinor: number
) {
  return Object.freeze({ side: "credit" as const, bucket, amountMinor });
}
