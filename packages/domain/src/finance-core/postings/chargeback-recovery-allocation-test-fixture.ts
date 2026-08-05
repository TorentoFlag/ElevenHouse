import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createFinanceJournalTransaction } from "../journal";
import { buildReceiptTransitionCases } from "../source-lot-operation-receipt-test-fixtures";
import { createChargebackPrincipalAllocationAuthority } from "../source-lots";
import { readUnverifiedChargebackPrincipalPositionTransitionBinding } from "./chargeback-principal-position";
import {
  chargebackPrincipalPositionInput,
  rehashChargebackPrincipalPosition
} from "./chargeback-principal-position-test-fixtures";
import { postingDecoderEnvelope, sha } from "./posting-test-primitives";

export function chargebackRecoveryAllocationFixture() {
  const recoveryCase = buildReceiptTransitionCases().find(
    (candidate) => candidate.kind === "chargeback_recovery_collected"
  );
  if (!recoveryCase) throw new Error("missing Task5 recovery transition");
  const recoverySource = recoveryCase.transition.historyRecord.authority;
  const confirmedSource = recoveryCase.previousState.history
    .map((record) => record.authority)
    .find((authority) => authority?.kind === "chargeback_confirmed");
  if (
    recoverySource?.kind !== "chargeback_recovery_collection" ||
    confirmedSource?.kind !== "chargeback_confirmed"
  ) {
    throw new Error("missing recovery authorities");
  }
  const providerEvidenceCore = {
    kind: "arc_payment_chargeback" as const,
    evidenceId: confirmedSource.canonicalEvidenceId,
    providerAccountId: confirmedSource.providerAccount.providerAccountId,
    providerPaymentId: confirmedSource.providerPaymentId,
    amount: confirmedSource.disputedDelta,
    observedAt: confirmedSource.confirmedAt
  };
  const providerEvidence = {
    ...providerEvidenceCore,
    canonicalDigest: hashFinanceCommandPayload(providerEvidenceCore)
  };
  const providerCore = {
    kind: "unverified_chargeback_provider_evidence_binding" as const,
    schemaVersion: 1 as const,
    bindingId: confirmedSource.confirmationId,
    version: confirmedSource.version,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    principalComponentId: "component-chargeback-principal-recovery-case",
    componentRegistryAuthorityRef: {
      kind: "finance_component_registry" as const,
      authorityId: "component-registry-recovery-case",
      version: 1,
      canonicalDigest: sha("a")
    },
    sourceAuthority: confirmedSource,
    sourceAuthorityDigest: hashFinanceCommandPayload(confirmedSource),
    operationReceiptId: "receipt-recovery-confirmed",
    operationReceiptDigest: sha("b"),
    providerEvidence
  };
  const providerBinding = {
    ...providerCore,
    bindingDigest: hashFinanceCommandPayload(providerCore)
  };
  const confirmedBasis = Object.freeze({
    restrictionId: confirmedSource.restrictionId,
    restrictionVersion: confirmedSource.version,
    confirmationAuthorityId: confirmedSource.authorityId,
    confirmationAuthorityVersion: confirmedSource.version,
    confirmationId: confirmedSource.confirmationId,
    confirmationAuthorityDigest: hashFinanceCommandPayload(confirmedSource),
    canonicalEvidenceId: confirmedSource.canonicalEvidenceId,
    providerAccount: confirmedSource.providerAccount,
    providerPaymentId: confirmedSource.providerPaymentId,
    cumulativeDisputedAmount: confirmedSource.nextCumulativeDisputedAmount,
    confirmedAt: confirmedSource.confirmedAt
  });
  const sourceAuthority = createChargebackPrincipalAllocationAuthority({
    kind: "chargeback_principal_allocation",
    authorityId: "recovery-accounting-source-authority",
    version: 1,
    chargebackCaseId: confirmedSource.chargebackCaseId,
    orderId: confirmedSource.orderId,
    astrologerUserId: confirmedSource.astrologerUserId,
    payableAmount: { amountMinor: 0, currency: "RUB" },
    accountingAllocationId: "original-recovery-principal-allocation",
    accountingAllocationRevisionId: "recovery-accounting-allocation-revision-1",
    accountingAllocationVersion: recoverySource.accountingAllocationVersion,
    allocationStatus: "approved",
    confirmedBasis
  });
  const recoveryAllocationSeed = {
    kind: "recovery_receivable" as const,
    allocationId: "recovery-exposure-1",
    componentId: "component-original-recovery",
    originalSaleId: confirmedSource.orderId,
    payableLotId: "paid-payable-lot-recovery-case",
    payoutRequestId: "payout-recovery-case",
    payoutAllocationId: "payout-allocation-recovery-case",
    amount: { amountMinor: 500, currency: "RUB" as const },
    treatmentAuthorityRef: {
      kind: "chargeback_recovery_treatment" as const,
      authorityId: "recovery-treatment-1",
      version: 1,
      canonicalDigest: sha("c")
    }
  };
  const positionTemplate = chargebackPrincipalPositionInput();
  const recoveryTemplate = positionTemplate.recoveryPositions[0];
  if (!recoveryTemplate) throw new Error("missing recovery position template");
  const treatmentCore: Record<string, unknown> = {
    ...recoveryTemplate.treatmentDecision,
    chargebackCaseId: sourceAuthority.chargebackCaseId,
    orderId: sourceAuthority.orderId,
    astrologerUserId: sourceAuthority.astrologerUserId,
    positionId: recoveryAllocationSeed.allocationId,
    decisionId: recoveryAllocationSeed.treatmentAuthorityRef.authorityId,
    version: recoveryAllocationSeed.treatmentAuthorityRef.version,
    approvedAmount: recoveryAllocationSeed.amount
  };
  Reflect.deleteProperty(treatmentCore, "canonicalDigest");
  const recoveryPosition = Object.freeze({
    ...recoveryTemplate,
    positionId: recoveryAllocationSeed.allocationId,
    originalSaleId: recoveryAllocationSeed.originalSaleId,
    componentId: recoveryAllocationSeed.componentId,
    payableLotId: recoveryAllocationSeed.payableLotId,
    payoutRequestId: recoveryAllocationSeed.payoutRequestId,
    payoutAllocationId: recoveryAllocationSeed.payoutAllocationId,
    sourceCapacity: recoveryAllocationSeed.amount,
    consumedBefore: { amountMinor: 0, currency: "RUB" as const },
    currentDelta: recoveryAllocationSeed.amount,
    consumedAfter: recoveryAllocationSeed.amount,
    remainingAfter: { amountMinor: 0, currency: "RUB" as const },
    treatmentDecision: Object.freeze({
      ...treatmentCore,
      canonicalDigest: hashFinanceCommandPayload(treatmentCore)
    })
  });
  const recoveryAllocation = Object.freeze({
    ...recoveryAllocationSeed,
    treatmentAuthorityRef: Object.freeze({
      ...recoveryAllocationSeed.treatmentAuthorityRef,
      canonicalDigest: recoveryPosition.treatmentDecision.canonicalDigest
    })
  });
  const positionBinding = readUnverifiedChargebackPrincipalPositionTransitionBinding(
    rehashChargebackPrincipalPosition({
      ...positionTemplate,
      bindingId: "recovery-position-transition-1",
      positionId: `chargeback-position:${sourceAuthority.chargebackCaseId}`,
      chargebackCaseId: sourceAuthority.chargebackCaseId,
      orderId: sourceAuthority.orderId,
      astrologerUserId: sourceAuthority.astrologerUserId,
      providerAccountId: confirmedSource.providerAccount.providerAccountId,
      accountingAllocationId: sourceAuthority.accountingAllocationId,
      accountingAllocationRevisionId: sourceAuthority.accountingAllocationRevisionId,
      accountingAllocationVersion: sourceAuthority.accountingAllocationVersion,
      confirmedBasis,
      providerEvidenceBindingDigest: providerBinding.bindingDigest,
      caseExposure: {
        disputedPrincipal: confirmedSource.nextCumulativeDisputedAmount,
        allocatedBefore: { amountMinor: 0, currency: "RUB" },
        payableDelta: { amountMinor: 0, currency: "RUB" },
        recoveryDelta: recoveryAllocation.amount,
        platformDelta: { amountMinor: 0, currency: "RUB" },
        allocationDelta: recoveryAllocation.amount,
        allocatedAfter: recoveryAllocation.amount,
        unallocatedAfter: { amountMinor: 4_500, currency: "RUB" }
      },
      recoveryPositions: [recoveryPosition],
      platformPositions: [],
      observedAt: "2026-08-05T00:00:00Z"
    }),
    postingDecoderEnvelope
  );
  const allocationCore = {
    kind: "chargeback_principal_posting_allocation" as const,
    schemaVersion: 1 as const,
    authorityId: sourceAuthority.accountingAllocationRevisionId,
    version: sourceAuthority.accountingAllocationVersion,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: sourceAuthority.chargebackCaseId,
    orderId: sourceAuthority.orderId,
    astrologerUserId: sourceAuthority.astrologerUserId,
    arcProviderAccountId: confirmedSource.providerAccount.providerAccountId,
    allocationStatus: "approved" as const,
    sourceAuthority,
    confirmedProviderEvidenceBinding: providerBinding,
    priorAllocationAuthorityRef: null,
    positionTransitionRef: Object.freeze({
      kind: positionBinding.kind,
      bindingId: positionBinding.bindingId,
      nextPositionVersion: positionBinding.nextPositionVersion,
      bindingDigest: positionBinding.bindingDigest
    }),
    disputedPrincipal: confirmedSource.nextCumulativeDisputedAmount,
    payablePrincipal: sourceAuthority.payableAmount,
    recoveryPrincipal: recoveryAllocation.amount,
    platformPrincipal: { amountMinor: 0, currency: "RUB" as const },
    principalAllocationDelta: recoveryAllocation.amount,
    nextAllocatedPrincipal: recoveryAllocation.amount,
    unallocatedSuspense: { amountMinor: 4_500, currency: "RUB" as const },
    recoveryAllocations: [recoveryAllocation],
    platformAllocations: [],
    approvedAt: "2026-08-05T00:00:00Z"
  };
  const allocationAuthority = {
    ...allocationCore,
    canonicalDigest: hashFinanceCommandPayload(allocationCore)
  };
  const links = {
    originalSaleId: recoveryAllocation.originalSaleId,
    componentId: recoveryAllocation.componentId,
    payableLotId: recoveryAllocation.payableLotId,
    payoutAllocationId: recoveryAllocation.payoutAllocationId
  };
  const allocationTransaction = createFinanceJournalTransaction({
    id: "journal-recovery-allocation-1",
    sourceKey: {
      kind: "chargeback",
      sourceId: sourceAuthority.accountingAllocationRevisionId,
      operation: "principal_allocated"
    },
    occurredAt: allocationCore.approvedAt,
    postedAt: allocationCore.approvedAt,
    reversesTransactionId: null,
    entries: [
      {
        account: {
          code: "astrologer_recovery_receivable",
          astrologerUserId: sourceAuthority.astrologerUserId,
          currency: "RUB"
        },
        side: "debit",
        amount: recoveryAllocation.amount,
        links
      },
      {
        account: {
          code: "chargeback_principal_suspense",
          arcProviderAccountId: confirmedSource.providerAccount.providerAccountId,
          currency: "RUB"
        },
        side: "credit",
        amount: recoveryAllocation.amount,
        links: { ...links, payableLotId: null, payoutAllocationId: null }
      }
    ]
  });
  const allocationRef = {
    kind: "chargeback_principal_posting_allocation" as const,
    authorityId: allocationAuthority.authorityId,
    accountingAllocationId: sourceAuthority.accountingAllocationId,
    version: allocationAuthority.version,
    nextAllocatedPrincipal: allocationAuthority.nextAllocatedPrincipal,
    canonicalDigest: allocationAuthority.canonicalDigest,
    journalTransactionId: allocationTransaction.id,
    journalDigest: hashFinanceCommandPayload(allocationTransaction)
  };
  return Object.freeze({
    recoveryCase,
    confirmedSource,
    positionBinding,
    allocationAuthority: Object.freeze(allocationAuthority),
    allocationTransaction,
    allocationRef: Object.freeze(allocationRef),
    recoveryAllocation: Object.freeze(recoveryAllocation)
  });
}
