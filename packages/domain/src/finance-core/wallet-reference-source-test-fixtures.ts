import { createPayableLotOperationReceipt } from "./source-lot-operation-receipt";
import { canonicalCapture } from "./source-lot-sale-hold-test-fixtures";
import {
  capturePendingPayableLot,
  confirmChargebackRestriction,
  createChargebackConfirmedAuthority,
  createChargebackLostAuthority,
  createEmptyPayableLotState,
  createPaymentCaptureIntegrityAuthority,
  createPayoutRequestAuthority,
  movePayoutSelectionToPending,
  recordChargebackLostRestrictionOutcome,
  releasePendingPayableLotFromState,
  selectPayoutPayableLots,
  type PayableLotReferenceState
} from "./source-lots";

export function emptySourceLotState(): PayableLotReferenceState {
  return createEmptyPayableLotState({
    astrologerUserId: "astrologer-1",
    currency: "RUB"
  });
}

export function releasedSourceLotFixture(
  allocation: Readonly<{
    reserveBps: number;
    availableMinor: number;
    reservedMinor: number;
  }> = { reserveBps: 1_000, availableMinor: 8_640, reservedMinor: 960 }
) {
  const capture = canonicalCapture();
  const captured = capturePendingPayableLot({
    state: emptySourceLotState(),
    expectedVersion: 1,
    lotId: "lot-order-1",
    economics: {
      orderId: "order-1",
      astrologerUserId: "astrologer-1",
      planId: "start",
      planVersionId: "start-v3",
      gross: { amountMinor: 10_000, currency: "RUB" },
      commission: { amountMinor: 400, currency: "RUB" },
      payable: { amountMinor: 9_600, currency: "RUB" },
      commissionBps: 400,
      allocationRevision: "bps_half_up_v1"
    },
    riskPolicy: {
      id: "risk-standard",
      policyVersion: 3,
      effectiveRiskTier: "standard",
      holdAnchor: "booking_completed",
      holdDurationHours: 48,
      reserveBps: allocation.reserveBps,
      reserveReleaseDelayDays: 30,
      providerSettlementRequired: true,
      payoutMinimum: { amountMinor: 100, currency: "RUB" },
      exceptionAuthority: null,
      effectiveAt: "2026-07-01T00:00:00Z"
    },
    fulfillment: {
      supported: true,
      registryKey: "single.once.live.solo",
      registryRevision: 1,
      holdAnchor: "booking_completed",
      terminalEvidence: { owner: "booking", status: "completed", contractVersion: 1 },
      cancellationAllocator: {
        owner: "booking",
        port: "BookingCancellationRefundDecisionPort",
        policyVersion: 1
      }
    },
    capture,
    capturedAt: "2026-08-01T09:00:00Z"
  });
  const paymentIntegrity = createPaymentCaptureIntegrityAuthority({
    kind: "current_payment_capture_integrity",
    authorityId: "payment-integrity-order-1",
    version: 4,
    status: "capture_clear",
    intentId: "intent-order-1",
    intentVersion: 3,
    providerAccountId: "arc-account-live",
    providerPaymentId: "provider-payment-order-1",
    canonicalEvidenceId: "capture-evidence-order-1",
    overCaptureIncidentId: null,
    evaluatedAt: "2026-08-03T10:00:00Z"
  });
  const released = releasePendingPayableLotFromState({
    state: captured.state,
    expectedVersion: captured.nextVersion,
    lotId: "lot-order-1",
    capture,
    paymentIntegrity,
    bookingCompletion: {
      bookingId: "booking-order-1",
      orderId: "order-1",
      owner: "booking",
      status: "completed",
      contractVersion: 1,
      completedAt: "2026-08-01T10:00:00Z",
      evidenceId: "booking-completion-order-1"
    },
    providerSettlement: {
      kind: "provider_settlement_matched",
      providerAccountId: "arc-account-live",
      paymentIntentId: "intent-order-1",
      providerPaymentId: "provider-payment-order-1",
      evidenceId: "settlement-order-1",
      matchedAt: "2026-08-02T00:00:00Z"
    },
    blocks: {
      kind: "payable_release_blocks",
      snapshotId: "blocks-order-1-2026-08-03T10:00:00Z",
      version: 1,
      orderId: "order-1",
      astrologerUserId: "astrologer-1",
      providerAccountId: "arc-account-live",
      paymentIntentId: "intent-order-1",
      currency: "RUB",
      evaluatedAt: "2026-08-03T10:00:00Z",
      refund: false,
      chargeback: false,
      reconciliation: false,
      manualRisk: false
    },
    allocation: {
      decisionId: "reserve-decision-order-1",
      version: 1,
      authority: {
        kind: "reserve_allocation",
        id: "finance-risk-allocation-authority",
        version: 1
      },
      orderId: "order-1",
      astrologerUserId: "astrologer-1",
      riskPolicyId: "risk-standard",
      riskPolicyVersion: 3,
      reserveBps: allocation.reserveBps,
      payable: { amountMinor: 9_600, currency: "RUB" },
      available: { amountMinor: allocation.availableMinor, currency: "RUB" },
      reserved: { amountMinor: allocation.reservedMinor, currency: "RUB" }
    },
    operationId: "hold-release-1",
    sourceKey: {
      kind: "reserve",
      sourceId: "hold-release-1",
      operation: "hold_released"
    },
    evaluatedAt: "2026-08-03T10:00:00Z",
    outputLotIds: {
      available: "lot-order-1-available",
      reserved: "lot-order-1-reserved"
    }
  });
  return Object.freeze({
    state: released.state,
    receipts: Object.freeze([
      createPayableLotOperationReceipt(captured),
      createPayableLotOperationReceipt(released)
    ])
  });
}

export function releasedSourceLotState(
  allocation: Readonly<{
    reserveBps: number;
    availableMinor: number;
    reservedMinor: number;
  }> = { reserveBps: 1_000, availableMinor: 8_640, reservedMinor: 960 }
): PayableLotReferenceState {
  return releasedSourceLotFixture(allocation).state;
}

export function payoutRequestedSourceLotFixture() {
  const base = releasedSourceLotFixture();
  const state = base.state;
  const selection = selectPayoutPayableLots({
    state,
    expectedVersion: state.version,
    astrologerUserId: "astrologer-1",
    amount: { amountMinor: 1_000, currency: "RUB" }
  });
  const moved = movePayoutSelectionToPending({
    state,
    expectedVersion: state.version,
    selection,
    authority: createPayoutRequestAuthority({
      kind: "payout_request",
      authorityId: "payout-request-authority-1",
      version: 1,
      payoutRequestId: "payout-1",
      astrologerUserId: "astrologer-1",
      amount: { amountMinor: 1_000, currency: "RUB" },
      allocations: [
        {
          payoutAllocationId: "payout-1-allocation-1",
          sourceLotId: "lot-order-1-available",
          payoutPendingLotId: "lot-order-1-payout-pending",
          amountMinor: 1_000
        }
      ]
    }),
    payoutRequestId: "payout-1",
    operationId: "payout-requested-1",
    sourceKey: { kind: "payout", sourceId: "payout-1", operation: "requested" },
    occurredAt: "2026-08-04T00:00:00Z",
    outputLotIds: [
      {
        sourceLotId: "lot-order-1-available",
        targetLotId: "lot-order-1-payout-pending",
        remainderLotId: "lot-order-1-available-remainder"
      }
    ]
  });
  return Object.freeze({
    state: moved.state,
    receipts: Object.freeze([...base.receipts, createPayableLotOperationReceipt(moved)])
  });
}

export function lostRestrictionSourceLotFixture() {
  const base = releasedSourceLotFixture();
  const confirmed = confirmChargebackRestriction({
    state: base.state,
    expectedVersion: base.state.version,
    authority: createChargebackConfirmedAuthority({
      kind: "chargeback_confirmed",
      authorityId: "wallet-reference-chargeback-confirmed-authority",
      version: 1,
      confirmationId: "wallet-reference-chargeback-confirmation",
      restrictionId: "wallet-reference-chargeback-restriction",
      confirmationKind: "initial",
      amountBasis: "cumulative",
      priorRestrictionVersion: null,
      chargebackCaseId: "wallet-reference-chargeback",
      orderId: "order-1",
      astrologerUserId: "astrologer-1",
      providerAccount: {
        seriesId: "arc-series-live",
        providerAccountId: "arc-account-live",
        identityVersion: 1
      },
      providerPaymentId: "provider-payment-order-1",
      priorCumulativeDisputedAmount: { amountMinor: 0, currency: "RUB" },
      nextCumulativeDisputedAmount: { amountMinor: 1_000, currency: "RUB" },
      disputedDelta: { amountMinor: 1_000, currency: "RUB" },
      canonicalEvidenceId: "wallet-reference-chargeback-confirmed-evidence",
      confirmedAt: "2026-08-04T00:00:00Z"
    }),
    operationId: "wallet-reference-chargeback-confirmed",
    sourceKey: {
      kind: "chargeback",
      sourceId: "wallet-reference-chargeback-confirmation",
      operation: "confirmed"
    },
    occurredAt: "2026-08-04T00:00:00Z"
  });
  const lost = recordChargebackLostRestrictionOutcome({
    state: confirmed.state,
    expectedVersion: confirmed.nextVersion,
    authority: createChargebackLostAuthority({
      kind: "chargeback_lost",
      authorityId: "wallet-reference-chargeback-lost-authority",
      version: 1,
      chargebackCaseId: "wallet-reference-chargeback",
      unallocatedSuspense: { amountMinor: 0, currency: "RUB" },
      accountingAllocationId: "wallet-reference-chargeback-lost-allocation",
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      canonicalEvidenceId: "wallet-reference-chargeback-lost-evidence",
      lostAt: "2026-08-05T00:00:00Z"
    }),
    operationId: "wallet-reference-chargeback-lost",
    operationKey: {
      kind: "chargeback_restriction",
      restrictionId: "wallet-reference-chargeback-restriction",
      operation: "lost_final"
    },
    occurredAt: "2026-08-05T00:00:00Z"
  });
  return Object.freeze({
    state: lost.state,
    receipts: Object.freeze([...base.receipts, createPayableLotOperationReceipt(confirmed)])
  });
}
