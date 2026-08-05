import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import type { UnverifiedChargebackPrincipalPositionTransitionBinding } from "./chargeback-principal-position-types";
import { sha } from "./posting-test-primitives";

const rub = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });

function treatmentDecision(
  treatment: "astrologer_recovery" | "platform_loss",
  positionId: string,
  approvedAmountMinor: number
) {
  const core = Object.freeze({
    kind: "unverified_chargeback_treatment_decision" as const,
    schemaVersion: 1 as const,
    decisionId: `decision-${positionId}`,
    version: 1,
    approvalStatus: "approved" as const,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: "chargeback-1",
    orderId: "order-1",
    astrologerUserId: "astrologer-1",
    positionId,
    treatment,
    approvedAmount: rub(approvedAmountMinor),
    policyId: "chargeback-principal-policy",
    policyVersion: 1,
    proposedByActorUserId: "finance-maker-1",
    approvedByActorUserId: "finance-checker-1",
    approvedAt: "2026-08-04T00:30:00Z"
  });
  return Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) });
}

export function chargebackPrincipalPositionInput(
  overrides: Record<string, unknown> = {}
): UnverifiedChargebackPrincipalPositionTransitionBinding {
  const recoveryPosition = Object.freeze({
    kind: "paid_recovery" as const,
    positionId: "recovery:payout-allocation-1",
    originalSaleId: "order-1",
    componentId: "component-astrologer-recovery",
    payableLotId: "paid-lot-1",
    payoutRequestId: "payout-1",
    payoutAllocationId: "payout-allocation-1",
    sourceCapacity: rub(800),
    consumedBefore: rub(0),
    currentDelta: rub(500),
    consumedAfter: rub(500),
    remainingAfter: rub(300),
    paidEvidence: Object.freeze({
      payoutPaidAuthorityId: "payout-paid-authority-1",
      payoutPaidAuthorityVersion: 1,
      payoutPaidAuthorityDigest: sha("1"),
      operationReceiptId: "receipt-payout-paid-1",
      operationReceiptDigest: sha("2"),
      journalTransactionId: "journal-payout-paid-1",
      journalTransactionDigest: sha("3"),
      bankReference: "bank-reference-1",
      transferredAt: "2026-08-03T15:00:00Z"
    }),
    treatmentDecision: treatmentDecision("astrologer_recovery", "recovery:payout-allocation-1", 800)
  });
  const platformPosition = Object.freeze({
    kind: "platform_commission_reversal" as const,
    positionId: "platform:component-platform-commission",
    originalSaleId: "order-1",
    componentId: "component-platform-commission",
    debitAccount: "platform_commission_revenue" as const,
    originalJournalEntry: Object.freeze({
      transactionId: "sale-commission-earned-journal",
      entryIndex: 1,
      canonicalDigest: sha("4")
    }),
    originalCommissionAmount: rub(1_000),
    deferredRemainingBefore: rub(0),
    revenueRemainingBefore: rub(1_000),
    reversedBefore: rub(0),
    currentDelta: rub(500),
    deferredRemainingAfter: rub(0),
    revenueRemainingAfter: rub(500),
    reversedAfter: rub(500),
    ledgerPositionAuthorityRef: Object.freeze({
      kind: "platform_component_position",
      authorityId: "platform-position-authority-1",
      version: 1,
      canonicalDigest: sha("5")
    })
  });
  const confirmedBasis = Object.freeze({
    restrictionId: "chargeback-restriction-1",
    restrictionVersion: 1,
    confirmationAuthorityId: "chargeback-confirmed-authority",
    confirmationAuthorityVersion: 1,
    confirmationId: "chargeback-confirmation-1",
    confirmationAuthorityDigest: sha("6"),
    canonicalEvidenceId: "chargeback-evidence-1",
    providerAccount: Object.freeze({
      seriesId: "arc-series-live",
      providerAccountId: "arc-live-1",
      identityVersion: 1
    }),
    providerPaymentId: "payment-1",
    cumulativeDisputedAmount: rub(5_000),
    confirmedAt: "2026-08-03T10:00:00Z"
  });
  const core = Object.freeze({
    kind: "unverified_chargeback_principal_position_transition_binding" as const,
    schemaVersion: 1 as const,
    bindingId: "chargeback-position-transition-1",
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    positionId: "chargeback-position-1",
    expectedPositionVersion: "0",
    nextPositionVersion: "1",
    previousBindingRef: null,
    chargebackCaseId: "chargeback-1",
    orderId: "order-1",
    astrologerUserId: "astrologer-1",
    providerAccountId: "arc-live-1",
    accountingAllocationId: "chargeback-allocation-1",
    accountingAllocationRevisionId: "chargeback-allocation-1-revision-1",
    accountingAllocationVersion: 1,
    providerEvidenceBindingDigest: sha("7"),
    confirmedBasis,
    caseExposure: Object.freeze({
      disputedPrincipal: rub(5_000),
      allocatedBefore: rub(0),
      payableDelta: rub(2_000),
      recoveryDelta: rub(500),
      platformDelta: rub(500),
      allocationDelta: rub(3_000),
      allocatedAfter: rub(3_000),
      unallocatedAfter: rub(2_000)
    }),
    recoveryPositions: Object.freeze([recoveryPosition]),
    platformPositions: Object.freeze([platformPosition]),
    observedAt: "2026-08-04T01:00:00Z",
    ...overrides
  });
  return Object.freeze({
    ...core,
    bindingDigest: hashFinanceCommandPayload(core)
  }) as unknown as UnverifiedChargebackPrincipalPositionTransitionBinding;
}

export function nextChargebackPrincipalPositionInput(
  prior = chargebackPrincipalPositionInput(),
  overrides: Record<string, unknown> = {}
): UnverifiedChargebackPrincipalPositionTransitionBinding {
  const priorRecovery = prior.recoveryPositions[0];
  const priorPlatform = prior.platformPositions[0];
  if (!priorRecovery || !priorPlatform || priorPlatform.kind !== "platform_commission_reversal") {
    throw new Error("missing position fixture");
  }
  return chargebackPrincipalPositionInput({
    bindingId: "chargeback-position-transition-2",
    expectedPositionVersion: "1",
    nextPositionVersion: "2",
    previousBindingRef: Object.freeze({
      bindingId: prior.bindingId,
      nextPositionVersion: prior.nextPositionVersion,
      bindingDigest: prior.bindingDigest
    }),
    accountingAllocationRevisionId: "chargeback-allocation-1-revision-2",
    accountingAllocationVersion: 2,
    caseExposure: Object.freeze({
      disputedPrincipal: rub(5_000),
      allocatedBefore: rub(3_000),
      payableDelta: rub(100),
      recoveryDelta: rub(0),
      platformDelta: rub(0),
      allocationDelta: rub(100),
      allocatedAfter: rub(3_100),
      unallocatedAfter: rub(1_900)
    }),
    recoveryPositions: Object.freeze([
      {
        ...priorRecovery,
        consumedBefore: priorRecovery.consumedAfter,
        currentDelta: rub(0),
        consumedAfter: priorRecovery.consumedAfter,
        remainingAfter: priorRecovery.remainingAfter
      }
    ]),
    platformPositions: Object.freeze([
      {
        ...priorPlatform,
        deferredRemainingBefore: priorPlatform.deferredRemainingAfter,
        revenueRemainingBefore: priorPlatform.revenueRemainingAfter,
        reversedBefore: priorPlatform.reversedAfter,
        currentDelta: rub(0),
        deferredRemainingAfter: priorPlatform.deferredRemainingAfter,
        revenueRemainingAfter: priorPlatform.revenueRemainingAfter,
        reversedAfter: priorPlatform.reversedAfter
      }
    ]),
    observedAt: "2026-08-04T02:00:00Z",
    ...overrides
  });
}

export function rehashChargebackPrincipalPosition<T extends Record<string, unknown>>(
  input: T
): Readonly<
  Omit<T, "bindingDigest"> & { readonly bindingDigest: FinanceAuthorizationPayloadHash }
> {
  const core = { ...input };
  Reflect.deleteProperty(core, "bindingDigest");
  return Object.freeze({
    ...core,
    bindingDigest: hashFinanceCommandPayload(core)
  }) as Readonly<
    Omit<T, "bindingDigest"> & { readonly bindingDigest: FinanceAuthorizationPayloadHash }
  >;
}
