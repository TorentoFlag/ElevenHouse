import { expect } from "vitest";
import { type PaidProductFulfillmentDecision } from "../products/paid-product-fulfillment-registry";
import {
  createEconomicPaymentIntent,
  openEconomicPaymentSession,
  type PersistedVerifiedEconomicPaymentCaptureReceipt
} from "./economic-payment";
import { createOrderEconomicsSnapshot } from "./order-economics";
import { createRiskPolicySnapshot } from "./risk-policy";
import {
  PayableSourceLotIntegrityError,
  capturePendingPayableLot,
  createEmptyPayableLotReferenceState,
  createPayableLotBlockSnapshot,
  createPaymentCaptureIntegrityAuthority,
  createReserveAllocationDecision,
  releasePendingPayableLotFromState,
  type PayableLotReferenceState,
  type PayableLotReferenceStateTransition
} from "./source-lots";

export const captureAt = "2026-08-01T09:00:00Z";
export const completionAt = "2026-08-01T10:00:00Z";
export const releaseAt = "2026-08-03T10:00:00Z";

export type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

export function mutableClone<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}

export const approvedFulfillment = Object.freeze({
  supported: true,
  registryKey: "single.once.live.solo",
  registryRevision: 1,
  holdAnchor: "booking_completed",
  terminalEvidence: Object.freeze({
    owner: "booking",
    status: "completed",
    contractVersion: 1
  }),
  cancellationAllocator: Object.freeze({
    owner: "booking",
    port: "BookingCancellationRefundDecisionPort",
    policyVersion: 1
  })
} satisfies Extract<PaidProductFulfillmentDecision, { supported: true }>);

export function economics(orderId = "order-1", astrologerUserId = "astrologer-1") {
  return createOrderEconomicsSnapshot({
    orderId,
    astrologerUserId,
    planId: "start",
    planVersionId: "start-v3",
    gross: { amountMinor: 10_000, currency: "RUB" },
    commission: { amountMinor: 400, currency: "RUB" },
    payable: { amountMinor: 9_600, currency: "RUB" },
    commissionBps: 400,
    allocationRevision: "bps_half_up_v1"
  });
}

export function risk(overrides: Record<string, unknown> = {}) {
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
    effectiveAt: "2026-07-01T00:00:00Z",
    ...overrides
  });
}

export function canonicalCapture(
  orderId = "order-1",
  captureIdentity = orderId,
  amountMinor = 10_000
): PersistedVerifiedEconomicPaymentCaptureReceipt {
  return verifiedCaptureReceipt(orderId, `intent-${captureIdentity}`, captureIdentity, amountMinor);
}

export function verifiedCaptureReceipt(
  orderId: string,
  intentId: string,
  captureIdentity = orderId,
  amountMinor = 10_000
): PersistedVerifiedEconomicPaymentCaptureReceipt {
  const providerAccount = {
    seriesId: "arc-series-live",
    providerAccountId: "arc-account-live",
    identityVersion: 1
  };
  const input = {
    intentId,
    version: 1,
    purpose: "client_order" as const,
    sourceId: orderId,
    providerAccount,
    amount: { amountMinor, currency: "RUB" as const }
  };
  const correlation = {
    intentId: input.intentId,
    purpose: input.purpose,
    sourceId: input.sourceId,
    providerAccount: input.providerAccount,
    amount: input.amount
  };
  const opened = openEconomicPaymentSession(
    createEconomicPaymentIntent(input, {
      kind: "resolved_economic_payment_source_set_input",
      authorityStatus: "unverified",
      sourceId: orderId,
      intents: []
    }),
    {
      expectedVersion: 1,
      sessionId: `session-${captureIdentity}`,
      correlation
    }
  );
  const session = opened.sessions.at(-1);
  if (!session) throw new Error("Expected opened payment session fixture");
  const canonicalEvidenceId = `capture-evidence-${captureIdentity}`;
  const effect = {
    kind: "client_sale_captured" as const,
    intentId: opened.intentId,
    sourceId: opened.sourceId,
    providerAccount: opened.providerAccount,
    providerPaymentId: `provider-payment-${captureIdentity}`,
    amount: opened.amount,
    canonicalEvidenceId
  };
  return {
    kind: "verified_provider_capture_receipt",
    authorityStatus: "verified_persisted",
    receiptId: canonicalEvidenceId,
    intent: {
      ...opened,
      version: opened.version + 1,
      state: "captured",
      sessions: [
        ...opened.sessions.slice(0, -1),
        {
          ...session,
          state: "captured",
          evidenceHistory: [
            ...session.evidenceHistory,
            {
              fromState: session.state,
              toState: "captured",
              kind: "canonical_provider_result",
              evidenceId: canonicalEvidenceId
            }
          ]
        }
      ],
      capture: effect,
      captureSessionId: `session-${captureIdentity}`
    },
    effect
  } as unknown as PersistedVerifiedEconomicPaymentCaptureReceipt;
}

export function reserveDecision(orderId = "order-1") {
  return createReserveAllocationDecision({
    decisionId: `reserve-decision-${orderId}`,
    version: 1,
    authority: {
      kind: "reserve_allocation",
      id: "finance-risk-allocation-authority",
      version: 1
    },
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

export function expectLotError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected payable source lot error");
  } catch (error) {
    expect(error).toBeInstanceOf(PayableSourceLotIntegrityError);
    expect((error as PayableSourceLotIntegrityError).reason).toBe(reason);
  }
}

export function capturedState(
  orderId = "order-state-1",
  intentId = `intent-${orderId}`,
  initialState?: PayableLotReferenceState,
  capturedAt = captureAt,
  riskOverrides: Record<string, unknown> = {}
): Readonly<{
  capture: PersistedVerifiedEconomicPaymentCaptureReceipt;
  transition: PayableLotReferenceStateTransition;
}> {
  const capture = verifiedCaptureReceipt(orderId, intentId);
  const initial =
    initialState ??
    createEmptyPayableLotReferenceState({
      astrologerUserId: "astrologer-1",
      currency: "RUB"
    });
  const transition = capturePendingPayableLot({
    state: initial,
    expectedVersion: initial.version,
    lotId: `lot-${orderId}`,
    economics: economics(orderId),
    riskPolicy: risk(riskOverrides),
    fulfillment: approvedFulfillment,
    capture,
    capturedAt
  });
  return { capture, transition };
}

export function paymentIntegrity(
  orderId: string,
  status: "capture_clear" | "over_capture_blocked" = "capture_clear",
  evaluatedAt = releaseAt
) {
  return createPaymentCaptureIntegrityAuthority({
    kind: "current_payment_capture_integrity",
    authorityId: `payment-integrity-${orderId}`,
    version: 4,
    status,
    intentId: `intent-${orderId}`,
    intentVersion: 3,
    providerAccountId: "arc-account-live",
    providerPaymentId: `provider-payment-${orderId}`,
    canonicalEvidenceId: `capture-evidence-${orderId}`,
    overCaptureIncidentId: status === "over_capture_blocked" ? "over-capture-1" : null,
    evaluatedAt
  });
}

export function blockSnapshot(
  orderId: string,
  overrides: Partial<
    Pick<
      ReturnType<typeof createPayableLotBlockSnapshot>,
      "refund" | "chargeback" | "reconciliation" | "manualRisk"
    >
  > = {},
  evaluatedAt = releaseAt
) {
  return createPayableLotBlockSnapshot({
    kind: "payable_release_blocks",
    snapshotId: `blocks-${orderId}-${evaluatedAt}`,
    version: 1,
    orderId,
    astrologerUserId: "astrologer-1",
    providerAccountId: "arc-account-live",
    paymentIntentId: `intent-${orderId}`,
    currency: "RUB",
    evaluatedAt,
    refund: false,
    chargeback: false,
    reconciliation: false,
    manualRisk: false,
    ...overrides
  });
}

export function releaseFixture(
  orderId = "order-state-1",
  options: {
    readonly initialState?: PayableLotReferenceState;
    readonly riskOverrides?: Record<string, unknown>;
    readonly commandOverrides?: Record<string, unknown>;
  } = {}
): Readonly<{
  capture: PersistedVerifiedEconomicPaymentCaptureReceipt;
  transition: PayableLotReferenceStateTransition;
  input: Parameters<typeof releasePendingPayableLotFromState>[0];
}> {
  const { capture, transition } = capturedState(
    orderId,
    `intent-${orderId}`,
    options.initialState,
    captureAt,
    options.riskOverrides
  );
  const input = {
    state: transition.state,
    expectedVersion: transition.nextVersion,
    lotId: `lot-${orderId}`,
    capture,
    paymentIntegrity: paymentIntegrity(orderId),
    bookingCompletion: {
      bookingId: `booking-${orderId}`,
      orderId,
      owner: "booking",
      status: "completed",
      contractVersion: 1,
      completedAt: completionAt,
      evidenceId: `booking-completion-${orderId}`
    },
    providerSettlement: {
      kind: "provider_settlement_matched",
      providerAccountId: "arc-account-live",
      paymentIntentId: `intent-${orderId}`,
      providerPaymentId: `provider-payment-${orderId}`,
      evidenceId: `settlement-${orderId}`,
      matchedAt: "2026-08-02T00:00:00Z"
    },
    blocks: blockSnapshot(orderId),
    allocation: reserveDecision(orderId),
    operationId: `hold-release-${orderId}`,
    sourceKey: {
      kind: "reserve",
      sourceId: `hold-release-${orderId}`,
      operation: "hold_released"
    },
    evaluatedAt: releaseAt,
    outputLotIds: {
      available: `lot-${orderId}-available`,
      reserved: `lot-${orderId}-reserved`
    },
    ...options.commandOverrides
  };
  return { capture, transition, input };
}

export function releaseState(orderId = "order-state-1", initialState?: PayableLotReferenceState) {
  return releasePendingPayableLotFromState(releaseFixture(orderId, { initialState }).input);
}
