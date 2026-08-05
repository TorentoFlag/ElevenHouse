import { expect } from "vitest";
import type { PaidProductFulfillmentDecision } from "../products/paid-product-fulfillment-registry";
import { createOrderEconomicsSnapshot } from "./order-economics";
import { createRiskPolicySnapshot } from "./risk-policy";
import {
  PayableSourceLotIntegrityError,
  approveRefundWithoutPayableLots,
  capturePendingPayableLot,
  confirmChargebackRestriction,
  confirmRefundPayableLots,
  createChargebackConfirmedAuthority,
  createEmptyPayableLotReferenceState,
  createPayableLotBlockSnapshot,
  createPaymentCaptureIntegrityAuthority,
  createPayoutRequestAuthority,
  createRefundApprovalAuthority,
  createRefundConfirmedAuthority,
  createRefundFailedAuthority,
  createReserveAllocationDecision,
  failRefundPayableLots,
  movePayoutSelectionToPending,
  moveRefundSelectionToPending,
  releasePendingPayableLotFromState,
  selectPayoutPayableLots,
  selectRefundPayableLots,
  type PayableLotReferenceState
} from "./source-lots";
import { digestValue } from "./source-lot-operation-receipt-core";
import { verifiedCaptureReceipt } from "./source-lot-sale-hold-test-fixtures";

const captureAt = "2026-08-01T09:00:00Z";
export const releaseAt = "2026-08-03T10:00:00Z";

export type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

export function mutableClone<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}

const fulfillment = Object.freeze({
  supported: true,
  registryKey: "single.once.live.solo",
  registryRevision: 1,
  holdAnchor: "booking_completed",
  terminalEvidence: Object.freeze({ owner: "booking", status: "completed", contractVersion: 1 }),
  cancellationAllocator: Object.freeze({
    owner: "booking",
    port: "BookingCancellationRefundDecisionPort",
    policyVersion: 1
  })
} satisfies Extract<PaidProductFulfillmentDecision, { supported: true }>);

function economics(orderId: string) {
  return createOrderEconomicsSnapshot({
    orderId,
    astrologerUserId: "astrologer-1",
    planId: "start",
    planVersionId: "start-v3",
    gross: { amountMinor: 10_000, currency: "RUB" },
    commission: { amountMinor: 400, currency: "RUB" },
    payable: { amountMinor: 9_600, currency: "RUB" },
    commissionBps: 400,
    allocationRevision: "bps_half_up_v1"
  });
}

function risk() {
  return createRiskPolicySnapshot({
    id: "risk-standard",
    policyVersion: 3,
    effectiveRiskTier: "standard",
    holdAnchor: "booking_completed",
    holdDurationHours: 48,
    reserveBps: 1_000,
    reserveReleaseDelayDays: 30,
    providerSettlementRequired: true,
    payoutMinimum: { amountMinor: 100, currency: "RUB" },
    exceptionAuthority: null,
    effectiveAt: "2026-07-01T00:00:00Z"
  });
}

function reserveDecision(orderId: string) {
  return createReserveAllocationDecision({
    decisionId: `reserve-decision-${orderId}`,
    version: 1,
    authority: { kind: "reserve_allocation", id: "risk-authority", version: 1 },
    orderId,
    astrologerUserId: "astrologer-1",
    riskPolicyId: "risk-standard",
    riskPolicyVersion: 3,
    reserveBps: 1_000,
    payable: { amountMinor: 9_600, currency: "RUB" },
    available: { amountMinor: 8_640, currency: "RUB" },
    reserved: { amountMinor: 960, currency: "RUB" }
  });
}

export function releasedState(
  orderId = "order-refund",
  initialState?: PayableLotReferenceState,
  timeline: Readonly<{
    capturedAt: string;
    bookingCompletedAt: string;
    settlementMatchedAt: string;
    integrityEvaluatedAt: string;
    releasedAt: string;
  }> = {
    capturedAt: captureAt,
    bookingCompletedAt: "2026-08-01T10:00:00Z",
    settlementMatchedAt: "2026-08-02T00:00:00Z",
    integrityEvaluatedAt: releaseAt,
    releasedAt: releaseAt
  }
) {
  const capture = verifiedCaptureReceipt(orderId, `intent-${orderId}`);
  const initial =
    initialState ??
    createEmptyPayableLotReferenceState({ astrologerUserId: "astrologer-1", currency: "RUB" });
  const captured = capturePendingPayableLot({
    state: initial,
    expectedVersion: initial.version,
    lotId: `lot-${orderId}`,
    economics: economics(orderId),
    riskPolicy: risk(),
    fulfillment,
    capture,
    capturedAt: timeline.capturedAt
  });
  const paymentIntegrity = createPaymentCaptureIntegrityAuthority({
    kind: "current_payment_capture_integrity",
    authorityId: `integrity-${orderId}`,
    version: 1,
    status: "capture_clear",
    intentId: `intent-${orderId}`,
    intentVersion: 3,
    providerAccountId: "arc-account-live",
    providerPaymentId: `provider-payment-${orderId}`,
    canonicalEvidenceId: `capture-evidence-${orderId}`,
    overCaptureIncidentId: null,
    evaluatedAt: timeline.integrityEvaluatedAt
  });
  return releasePendingPayableLotFromState({
    state: captured.state,
    expectedVersion: captured.nextVersion,
    lotId: `lot-${orderId}`,
    capture,
    paymentIntegrity,
    bookingCompletion: {
      bookingId: `booking-${orderId}`,
      orderId,
      owner: "booking",
      status: "completed",
      contractVersion: 1,
      completedAt: timeline.bookingCompletedAt,
      evidenceId: `booking-completion-${orderId}`
    },
    providerSettlement: {
      kind: "provider_settlement_matched",
      providerAccountId: "arc-account-live",
      paymentIntentId: `intent-${orderId}`,
      providerPaymentId: `provider-payment-${orderId}`,
      evidenceId: `settlement-${orderId}`,
      matchedAt: timeline.settlementMatchedAt
    },
    blocks: createPayableLotBlockSnapshot({
      kind: "payable_release_blocks",
      snapshotId: `blocks-${orderId}-${timeline.releasedAt}`,
      version: 1,
      orderId,
      astrologerUserId: "astrologer-1",
      providerAccountId: "arc-account-live",
      paymentIntentId: `intent-${orderId}`,
      currency: "RUB",
      evaluatedAt: timeline.releasedAt,
      refund: false,
      chargeback: false,
      reconciliation: false,
      manualRisk: false
    }),
    allocation: reserveDecision(orderId),
    operationId: `hold-release-${orderId}`,
    sourceKey: { kind: "reserve", sourceId: `hold-release-${orderId}`, operation: "hold_released" },
    evaluatedAt: timeline.releasedAt,
    outputLotIds: {
      available: `lot-${orderId}-available`,
      reserved: `lot-${orderId}-reserved`
    }
  });
}

export function expectLotError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected payable source lot error");
  } catch (error) {
    expect(error).toBeInstanceOf(PayableSourceLotIntegrityError);
    expect((error as PayableSourceLotIntegrityError).reason).toBe(reason);
  }
}

export function refundPendingState() {
  const released = releasedState();
  const selection = selectRefundPayableLots({
    state: released.state,
    expectedVersion: released.nextVersion,
    astrologerUserId: "astrologer-1",
    orderId: "order-refund",
    amount: { amountMinor: 2_000, currency: "RUB" },
    requestedLots: [
      { lotId: "lot-order-refund-available", amountMinor: 1_500 },
      { lotId: "lot-order-refund-reserved", amountMinor: 500 }
    ]
  });
  const authority = createRefundApprovalAuthority({
    kind: "refund_approval",
    authorityId: "refund-approval-authority-1",
    version: 1,
    refundId: "refund-1",
    orderId: "order-refund",
    astrologerUserId: "astrologer-1",
    payableAmount: { amountMinor: 2_000, currency: "RUB" },
    accountingAllocationId: "refund-accounting-allocation-1",
    accountingAllocationVersion: 1,
    fundingStatus: "fully_funded"
  });
  const moved = moveRefundSelectionToPending({
    state: released.state,
    expectedVersion: released.nextVersion,
    selection,
    authority,
    refundId: "refund-1",
    operationId: "refund-approved-1",
    sourceKey: { kind: "refund", sourceId: "refund-1", operation: "approved" },
    occurredAt: "2026-08-04T00:00:00Z",
    outputLotIds: [
      {
        sourceLotId: "lot-order-refund-available",
        targetLotId: "refund-1-from-available",
        remainderLotId: "refund-1-available-remainder"
      },
      {
        sourceLotId: "lot-order-refund-reserved",
        targetLotId: "refund-1-from-reserved",
        remainderLotId: "refund-1-reserved-remainder"
      }
    ]
  });
  return { released, selection, authority, moved };
}

export function confirmedRefundAuthority(overrides: Record<string, unknown> = {}) {
  return createRefundConfirmedAuthority({
    kind: "refund_confirmed",
    authorityId: "refund-confirmed-authority-1",
    version: 1,
    refundId: "refund-1",
    providerAccountId: "arc-account-live",
    providerPaymentId: "provider-payment-order-refund",
    providerRefundId: "provider-refund-1",
    providerAmountBasis: "incremental",
    providerRefundAmount: { amountMinor: 2_500, currency: "RUB" },
    priorProviderTotalRefunded: { amountMinor: 0, currency: "RUB" },
    nextProviderTotalRefunded: { amountMinor: 2_500, currency: "RUB" },
    payableAmount: { amountMinor: 2_000, currency: "RUB" },
    accountingAllocationId: "refund-accounting-allocation-1",
    accountingAllocationVersion: 1,
    canonicalEvidenceId: "provider-refund-confirmed-1",
    confirmedAt: "2026-08-05T00:00:00Z",
    ...overrides
  });
}

export function failedRefundAuthority(overrides: Record<string, unknown> = {}) {
  return createRefundFailedAuthority({
    kind: "refund_failed",
    authorityId: "refund-failed-authority-1",
    version: 1,
    refundId: "refund-1",
    providerAccountId: "arc-account-live",
    providerPaymentId: "provider-payment-order-refund",
    providerRefundId: "provider-refund-1",
    providerRefundAmount: { amountMinor: 2_500, currency: "RUB" },
    payableAmount: { amountMinor: 2_000, currency: "RUB" },
    accountingAllocationId: "refund-accounting-allocation-1",
    accountingAllocationVersion: 1,
    failureCode: "provider_declined",
    canonicalEvidenceId: "provider-refund-failed-1",
    failedAt: "2026-08-05T00:00:00Z",
    ...overrides
  });
}

export function payoutPendingState(
  options: Readonly<{ payoutOrderId: string; refundedOrderId: string }> = {
    payoutOrderId: "order-bridge",
    refundedOrderId: "order-bridge"
  }
) {
  const payoutReleased = releasedState(options.payoutOrderId);
  const released =
    options.refundedOrderId === options.payoutOrderId
      ? payoutReleased
      : releasedState(options.refundedOrderId, payoutReleased.state);
  const selection = selectPayoutPayableLots({
    state: released.state,
    expectedVersion: released.nextVersion,
    astrologerUserId: "astrologer-1",
    amount: { amountMinor: 1_000, currency: "RUB" }
  });
  const authority = createPayoutRequestAuthority({
    kind: "payout_request",
    authorityId: "payout-bridge-request-authority",
    version: 1,
    payoutRequestId: "payout-bridge",
    astrologerUserId: "astrologer-1",
    amount: { amountMinor: 1_000, currency: "RUB" },
    allocations: [
      {
        payoutAllocationId: "payout-bridge-allocation",
        sourceLotId: `lot-${options.payoutOrderId}-available`,
        payoutPendingLotId: "payout-bridge-pending",
        amountMinor: 1_000
      }
    ]
  });
  const moved = movePayoutSelectionToPending({
    state: released.state,
    expectedVersion: released.nextVersion,
    selection,
    authority,
    payoutRequestId: "payout-bridge",
    operationId: "payout-bridge-requested",
    sourceKey: { kind: "payout", sourceId: "payout-bridge", operation: "requested" },
    occurredAt: "2026-08-03T11:00:00Z",
    outputLotIds: [
      {
        sourceLotId: `lot-${options.payoutOrderId}-available`,
        targetLotId: "payout-bridge-pending",
        remainderLotId: "payout-bridge-available-remainder"
      }
    ]
  });
  const refundConfirmed = confirmBridgeRefund(moved.state, options.refundedOrderId);
  return {
    released,
    authority,
    moved,
    state: refundConfirmed.state,
    nextVersion: refundConfirmed.nextVersion
  };
}

function confirmBridgeRefund(state: PayableLotReferenceState, refundedOrderId: string) {
  const refundApproved = approveRefundWithoutPayableLots({
    state,
    expectedVersion: state.version,
    authority: createRefundApprovalAuthority({
      kind: "refund_approval",
      authorityId: "refund-bridge-approval-authority",
      version: 1,
      refundId: "refund-bridge-1",
      orderId: refundedOrderId,
      astrologerUserId: "astrologer-1",
      payableAmount: { amountMinor: 0, currency: "RUB" },
      accountingAllocationId: "refund-accounting-allocation-bridge",
      accountingAllocationVersion: 1,
      fundingStatus: "fully_funded"
    }),
    operationId: "refund-bridge-approved",
    sourceKey: { kind: "refund", sourceId: "refund-bridge-1", operation: "approved" },
    occurredAt: "2026-08-03T12:00:00Z"
  });
  const refundConfirmed = confirmRefundPayableLots({
    state: refundApproved.state,
    expectedVersion: refundApproved.nextVersion,
    refundId: "refund-bridge-1",
    authority: createRefundConfirmedAuthority({
      kind: "refund_confirmed",
      authorityId: "refund-bridge-confirmed-authority",
      version: 1,
      refundId: "refund-bridge-1",
      providerAccountId: "arc-account-live",
      providerPaymentId: `provider-payment-${refundedOrderId}`,
      providerRefundId: "provider-refund-bridge-context",
      providerAmountBasis: "incremental",
      providerRefundAmount: { amountMinor: 1_000, currency: "RUB" },
      priorProviderTotalRefunded: { amountMinor: 0, currency: "RUB" },
      nextProviderTotalRefunded: { amountMinor: 1_000, currency: "RUB" },
      payableAmount: { amountMinor: 0, currency: "RUB" },
      accountingAllocationId: "refund-accounting-allocation-bridge",
      accountingAllocationVersion: 1,
      canonicalEvidenceId: "refund-bridge-confirmed-evidence",
      confirmedAt: "2026-08-03T13:00:00Z"
    }),
    operationId: "refund-bridge-confirmed",
    sourceKey: { kind: "refund", sourceId: "refund-bridge-1", operation: "confirmed" },
    occurredAt: "2026-08-03T13:00:00Z"
  });
  return refundConfirmed;
}

export function sameOrderMultiAllocationPayoutPendingState() {
  const orderId = "order-bridge-multi";
  const released = releasedState(orderId);
  const splitSelection = selectRefundPayableLots({
    state: released.state,
    expectedVersion: released.nextVersion,
    astrologerUserId: "astrologer-1",
    orderId,
    amount: { amountMinor: 1_000, currency: "RUB" },
    requestedLots: [{ lotId: `lot-${orderId}-available`, amountMinor: 1_000 }]
  });
  const splitApproval = createRefundApprovalAuthority({
    kind: "refund_approval",
    authorityId: "refund-bridge-split-approval-authority",
    version: 1,
    refundId: "refund-bridge-split",
    orderId,
    astrologerUserId: "astrologer-1",
    payableAmount: { amountMinor: 1_000, currency: "RUB" },
    accountingAllocationId: "refund-bridge-split-accounting-allocation",
    accountingAllocationVersion: 1,
    fundingStatus: "fully_funded"
  });
  const splitPending = moveRefundSelectionToPending({
    state: released.state,
    expectedVersion: released.nextVersion,
    selection: splitSelection,
    authority: splitApproval,
    refundId: "refund-bridge-split",
    operationId: "refund-bridge-split-approved",
    sourceKey: { kind: "refund", sourceId: "refund-bridge-split", operation: "approved" },
    occurredAt: "2026-08-03T11:00:00Z",
    outputLotIds: [
      {
        sourceLotId: `lot-${orderId}-available`,
        targetLotId: "refund-bridge-split-pending",
        remainderLotId: "refund-bridge-split-remainder"
      }
    ]
  });
  const splitRestored = failRefundPayableLots({
    state: splitPending.state,
    expectedVersion: splitPending.nextVersion,
    refundId: "refund-bridge-split",
    authority: createRefundFailedAuthority({
      kind: "refund_failed",
      authorityId: "refund-bridge-split-failed-authority",
      version: 1,
      refundId: "refund-bridge-split",
      providerAccountId: "arc-account-live",
      providerPaymentId: `provider-payment-${orderId}`,
      providerRefundId: "provider-refund-bridge-split",
      providerRefundAmount: { amountMinor: 1_000, currency: "RUB" },
      payableAmount: { amountMinor: 1_000, currency: "RUB" },
      accountingAllocationId: "refund-bridge-split-accounting-allocation",
      accountingAllocationVersion: 1,
      failureCode: "provider_declined",
      canonicalEvidenceId: "provider-refund-bridge-split-failed",
      failedAt: "2026-08-03T11:30:00Z"
    }),
    operationId: "refund-bridge-split-failed",
    sourceKey: { kind: "refund", sourceId: "refund-bridge-split", operation: "failed" },
    occurredAt: "2026-08-03T11:30:00Z",
    outputLotIds: [
      {
        sourceLotId: "refund-bridge-split-pending",
        targetLotId: "refund-bridge-split-restored"
      }
    ]
  });
  const selection = selectPayoutPayableLots({
    state: splitRestored.state,
    expectedVersion: splitRestored.nextVersion,
    astrologerUserId: "astrologer-1",
    amount: { amountMinor: 8_000, currency: "RUB" }
  });
  const allocationRows = selection.allocations.map((allocation, index) => ({
    payoutAllocationId: `payout-bridge-multi-allocation-${index + 1}`,
    sourceLotId: allocation.lotId,
    payoutPendingLotId: `payout-bridge-multi-pending-${index + 1}`,
    amountMinor: allocation.amountMinor
  }));
  const authority = createPayoutRequestAuthority({
    kind: "payout_request",
    authorityId: "payout-bridge-multi-request-authority",
    version: 1,
    payoutRequestId: "payout-bridge-multi",
    astrologerUserId: "astrologer-1",
    amount: { amountMinor: 8_000, currency: "RUB" },
    allocations: allocationRows
  });
  const moved = movePayoutSelectionToPending({
    state: splitRestored.state,
    expectedVersion: splitRestored.nextVersion,
    selection,
    authority,
    payoutRequestId: "payout-bridge-multi",
    operationId: "payout-bridge-multi-requested",
    sourceKey: { kind: "payout", sourceId: "payout-bridge-multi", operation: "requested" },
    occurredAt: "2026-08-03T12:00:00Z",
    outputLotIds: allocationRows.map((allocation) => {
      const source = splitRestored.state.lots.find((lot) => lot.lotId === allocation.sourceLotId);
      if (!source) throw new Error("missing payout source fixture");
      return {
        sourceLotId: allocation.sourceLotId,
        targetLotId: allocation.payoutPendingLotId,
        remainderLotId:
          source.amount.amountMinor === allocation.amountMinor
            ? null
            : `${allocation.payoutPendingLotId}-remainder`
      };
    })
  });
  const confirmed = confirmBridgeRefund(moved.state, orderId);
  return { orderId, released, splitRestored, selection, authority, moved, confirmed };
}

export function chargebackRestrictedState() {
  const released = releasedState("order-chargeback");
  const authority = createChargebackConfirmedAuthority({
    kind: "chargeback_confirmed",
    authorityId: "chargeback-confirmed-authority-1",
    version: 1,
    confirmationId: "chargeback-confirmation-1",
    restrictionId: "chargeback-restriction-1",
    confirmationKind: "initial",
    amountBasis: "cumulative",
    priorRestrictionVersion: null,
    chargebackCaseId: "chargeback-1",
    orderId: "order-chargeback",
    astrologerUserId: "astrologer-1",
    providerAccount: {
      seriesId: "arc-series-live",
      providerAccountId: "arc-account-live",
      identityVersion: 1
    },
    providerPaymentId: "provider-payment-order-chargeback",
    priorCumulativeDisputedAmount: { amountMinor: 0, currency: "RUB" },
    nextCumulativeDisputedAmount: { amountMinor: 5_000, currency: "RUB" },
    disputedDelta: { amountMinor: 5_000, currency: "RUB" },
    canonicalEvidenceId: "chargeback-confirmed-evidence-1",
    confirmedAt: "2026-08-04T00:00:00Z"
  });
  const restricted = confirmChargebackRestriction({
    state: released.state,
    expectedVersion: released.nextVersion,
    authority,
    operationId: "chargeback-confirmed-1",
    sourceKey: {
      kind: "chargeback",
      sourceId: "chargeback-confirmation-1",
      operation: "confirmed"
    },
    occurredAt: "2026-08-04T00:00:00Z"
  });
  return { released, authority, restricted };
}

export function chargebackPrincipalConfirmedBasis(
  state: PayableLotReferenceState,
  chargebackCaseId: string
) {
  const restriction = state.chargebackRestrictions.find(
    (candidate) => candidate.chargebackCaseId === chargebackCaseId
  );
  const confirmation = state.history
    .map((record) => record.authority)
    .filter(
      (authority) =>
        authority?.kind === "chargeback_confirmed" &&
        authority.chargebackCaseId === chargebackCaseId
    )
    .at(-1);
  if (!restriction || confirmation?.kind !== "chargeback_confirmed") {
    throw new Error("missing chargeback confirmed basis fixture");
  }
  return Object.freeze({
    restrictionId: restriction.restrictionId,
    restrictionVersion: restriction.version,
    confirmationAuthorityId: confirmation.authorityId,
    confirmationAuthorityVersion: confirmation.version,
    confirmationId: confirmation.confirmationId,
    confirmationAuthorityDigest: digestValue(confirmation),
    canonicalEvidenceId: confirmation.canonicalEvidenceId,
    providerAccount: confirmation.providerAccount,
    providerPaymentId: confirmation.providerPaymentId,
    cumulativeDisputedAmount: confirmation.nextCumulativeDisputedAmount,
    confirmedAt: confirmation.confirmedAt
  });
}
