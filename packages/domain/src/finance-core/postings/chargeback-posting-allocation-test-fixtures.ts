import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { sha } from "./posting-test-primitives";
import { chargebackPrincipalPositionInput } from "./chargeback-principal-position-test-fixtures";

const confirmedSourceAuthority = Object.freeze({
  kind: "chargeback_confirmed" as const,
  authorityId: "chargeback-confirmed-authority",
  version: 1,
  confirmationId: "chargeback-confirmation-1",
  restrictionId: "chargeback-restriction-1",
  confirmationKind: "initial" as const,
  amountBasis: "cumulative" as const,
  priorRestrictionVersion: null,
  chargebackCaseId: "chargeback-1",
  orderId: "order-1",
  astrologerUserId: "astrologer-1",
  providerAccount: Object.freeze({
    seriesId: "arc-series-live",
    providerAccountId: "arc-live-1",
    identityVersion: 1
  }),
  providerPaymentId: "payment-1",
  priorCumulativeDisputedAmount: { amountMinor: 0, currency: "RUB" as const },
  nextCumulativeDisputedAmount: { amountMinor: 5_000, currency: "RUB" as const },
  disputedDelta: { amountMinor: 5_000, currency: "RUB" as const },
  canonicalEvidenceId: "chargeback-evidence-1",
  confirmedAt: "2026-08-03T10:00:00Z"
});

export const sourceAuthority = Object.freeze({
  kind: "chargeback_principal_allocation" as const,
  authorityId: "chargeback-principal-authority",
  version: 1,
  chargebackCaseId: "chargeback-1",
  orderId: "order-1",
  astrologerUserId: "astrologer-1",
  payableAmount: { amountMinor: 2_000, currency: "RUB" as const },
  accountingAllocationId: "chargeback-allocation-1",
  accountingAllocationRevisionId: "chargeback-allocation-1-revision-1",
  accountingAllocationVersion: 1,
  allocationStatus: "approved" as const,
  confirmedBasis: Object.freeze({
    restrictionId: confirmedSourceAuthority.restrictionId,
    restrictionVersion: 1,
    confirmationAuthorityId: confirmedSourceAuthority.authorityId,
    confirmationAuthorityVersion: confirmedSourceAuthority.version,
    confirmationId: confirmedSourceAuthority.confirmationId,
    confirmationAuthorityDigest: hashFinanceCommandPayload(confirmedSourceAuthority),
    canonicalEvidenceId: confirmedSourceAuthority.canonicalEvidenceId,
    providerAccount: confirmedSourceAuthority.providerAccount,
    providerPaymentId: confirmedSourceAuthority.providerPaymentId,
    cumulativeDisputedAmount: confirmedSourceAuthority.nextCumulativeDisputedAmount,
    confirmedAt: confirmedSourceAuthority.confirmedAt
  })
});

function confirmedProviderEvidenceBinding() {
  const providerEvidenceCore = Object.freeze({
    kind: "arc_payment_chargeback" as const,
    evidenceId: confirmedSourceAuthority.canonicalEvidenceId,
    providerAccountId: confirmedSourceAuthority.providerAccount.providerAccountId,
    providerPaymentId: confirmedSourceAuthority.providerPaymentId,
    amount: confirmedSourceAuthority.disputedDelta,
    observedAt: confirmedSourceAuthority.confirmedAt
  });
  const core = Object.freeze({
    kind: "unverified_chargeback_provider_evidence_binding" as const,
    schemaVersion: 1 as const,
    bindingId: confirmedSourceAuthority.confirmationId,
    version: confirmedSourceAuthority.version,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    principalComponentId: "component-chargeback-principal",
    componentRegistryAuthorityRef: Object.freeze({
      kind: "finance_component_registry" as const,
      authorityId: "component-registry-chargeback-principal",
      version: 1,
      canonicalDigest: sha("d")
    }),
    sourceAuthority: confirmedSourceAuthority,
    sourceAuthorityDigest: hashFinanceCommandPayload(confirmedSourceAuthority),
    operationReceiptId: "receipt-chargeback-confirmed",
    operationReceiptDigest: sha("e"),
    providerEvidence: Object.freeze({
      ...providerEvidenceCore,
      canonicalDigest: hashFinanceCommandPayload(providerEvidenceCore)
    })
  });
  return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
}

export const recoveryAllocation = Object.freeze({
  kind: "recovery_receivable" as const,
  allocationId: "chargeback-recovery-component-allocation",
  componentId: "component-astrologer-recovery",
  originalSaleId: "order-1",
  payableLotId: "paid-lot-1",
  payoutRequestId: "payout-1",
  payoutAllocationId: "payout-allocation-1",
  amount: { amountMinor: 500, currency: "RUB" as const },
  treatmentAuthorityRef: Object.freeze({
    kind: "chargeback_recovery_treatment",
    authorityId: "chargeback-recovery-treatment-1",
    version: 1,
    canonicalDigest: sha("a")
  })
});

export const platformAllocation = Object.freeze({
  kind: "platform_component" as const,
  allocationId: "chargeback-platform-component-allocation",
  componentId: "component-platform-commission",
  originalSaleId: "order-1",
  accountCode: "platform_commission_revenue" as const,
  amount: { amountMinor: 500, currency: "RUB" as const },
  originalJournalEntry: Object.freeze({
    transactionId: "sale-commission-earned-journal",
    entryIndex: 1,
    canonicalDigest: sha("b")
  }),
  treatmentAuthorityRef: Object.freeze({
    kind: "chargeback_component_reversal",
    authorityId: "chargeback-component-reversal-1",
    version: 1,
    canonicalDigest: sha("c")
  })
});

export function allocationInput(overrides: Record<string, unknown> = {}) {
  const position = chargebackPrincipalPositionInput();
  const core = Object.freeze({
    kind: "chargeback_principal_posting_allocation" as const,
    schemaVersion: 1 as const,
    authorityId: sourceAuthority.accountingAllocationRevisionId,
    version: sourceAuthority.accountingAllocationVersion,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: "chargeback-1",
    orderId: "order-1",
    astrologerUserId: "astrologer-1",
    arcProviderAccountId: "arc-live-1",
    allocationStatus: "approved" as const,
    sourceAuthority,
    confirmedProviderEvidenceBinding: confirmedProviderEvidenceBinding(),
    priorAllocationAuthorityRef: null,
    positionTransitionRef: Object.freeze({
      kind: position.kind,
      bindingId: position.bindingId,
      nextPositionVersion: position.nextPositionVersion,
      bindingDigest: position.bindingDigest
    }),
    disputedPrincipal: { amountMinor: 5_000, currency: "RUB" as const },
    payablePrincipal: { amountMinor: 2_000, currency: "RUB" as const },
    recoveryPrincipal: { amountMinor: 500, currency: "RUB" as const },
    platformPrincipal: { amountMinor: 500, currency: "RUB" as const },
    principalAllocationDelta: { amountMinor: 3_000, currency: "RUB" as const },
    nextAllocatedPrincipal: { amountMinor: 3_000, currency: "RUB" as const },
    unallocatedSuspense: { amountMinor: 2_000, currency: "RUB" as const },
    recoveryAllocations: Object.freeze([recoveryAllocation]),
    platformAllocations: Object.freeze([platformAllocation]),
    approvedAt: "2026-08-04T01:00:00Z",
    ...overrides
  });
  return Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) });
}
