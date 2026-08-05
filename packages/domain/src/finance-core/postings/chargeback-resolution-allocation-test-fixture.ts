import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { buildChargebackPrincipalAllocationPosting } from "./chargeback-allocation-posting";
import {
  chargebackAllocationPostingFixture,
  rehashChargebackAllocation
} from "./chargeback-allocation-posting-test-fixtures";
import { receiptDecoderEnvelope } from "./chargeback-confirmed-posting-test-fixtures";
import { readUnverifiedChargebackPrincipalPositionTransitionBinding } from "./chargeback-principal-position";
import { rehashChargebackPrincipalPosition } from "./chargeback-principal-position-test-fixtures";
import { postingDecoderEnvelope } from "./posting-test-primitives";

export function chargebackResolutionAllocationFixture(fullyAllocated = false) {
  const base = extendRecoveryCapacity(chargebackAllocationPostingFixture() as never);
  const full = fullyAllocated ? fullAllocation(base as never) : null;
  const allocationAuthority = full?.allocationAuthority ?? base.allocationAuthority;
  const principalPositionTransitionBinding =
    full?.principalPositionTransitionBinding ?? base.principalPositionTransitionBinding;
  const originalPlatformJournals = fullyAllocated
    ? Object.freeze([])
    : base.originalPlatformJournals;
  const recipe = buildChargebackPrincipalAllocationPosting(
    {
      context: base.context,
      allocationAuthority,
      resolvedPriorAllocationAuthority: base.resolvedPriorAllocationAuthority,
      principalPositionTransitionBinding,
      resolvedPriorPrincipalPositionTransitionBinding:
        base.resolvedPriorPrincipalPositionTransitionBinding,
      providerConfirmationOperationReceipt: base.providerConfirmationOperationReceipt,
      providerConfirmationComponentBindings: base.providerConfirmationComponentBindings,
      allocationOperationReceipt: base.allocationOperationReceipt,
      allocationComponentBindings: base.allocationComponentBindings,
      operationSnapshotRef: base.operationSnapshotRef,
      originalPlatformJournals
    },
    postingDecoderEnvelope,
    receiptDecoderEnvelope
  );
  const allocationRef = Object.freeze({
    kind: "chargeback_principal_posting_allocation" as const,
    authorityId: allocationAuthority.authorityId,
    accountingAllocationId: allocationAuthority.sourceAuthority.accountingAllocationId,
    version: allocationAuthority.version,
    nextAllocatedPrincipal: allocationAuthority.nextAllocatedPrincipal,
    canonicalDigest: allocationAuthority.canonicalDigest,
    journalTransactionId: recipe.transaction.id,
    journalDigest: hashFinanceCommandPayload(recipe.transaction)
  });
  return Object.freeze({
    base,
    allocationAuthority,
    principalPositionTransitionBinding,
    allocationTransaction: recipe.transaction,
    allocationRef,
    originalPlatformJournals
  });
}

function extendRecoveryCapacity(base: ReturnType<typeof chargebackAllocationPostingFixture>) {
  const position = readUnverifiedChargebackPrincipalPositionTransitionBinding(
    base.principalPositionTransitionBinding,
    postingDecoderEnvelope
  );
  const recoveryPosition = position.recoveryPositions[0];
  const recoveryAllocation = base.allocationAuthority.recoveryAllocations[0];
  if (!recoveryPosition || !recoveryAllocation) {
    throw new Error("missing extendable recovery position");
  }
  const decisionCore = { ...recoveryPosition.treatmentDecision };
  Reflect.deleteProperty(decisionCore, "canonicalDigest");
  const treatmentDecision = Object.freeze({
    ...decisionCore,
    approvedAmount: { amountMinor: 800, currency: "RUB" as const },
    canonicalDigest: hashFinanceCommandPayload({
      ...decisionCore,
      approvedAmount: { amountMinor: 800, currency: "RUB" as const }
    })
  });
  const nextPosition = readUnverifiedChargebackPrincipalPositionTransitionBinding(
    rehashChargebackPrincipalPosition({
      ...position,
      recoveryPositions: [
        {
          ...recoveryPosition,
          sourceCapacity: treatmentDecision.approvedAmount,
          remainingAfter: { amountMinor: 300, currency: "RUB" },
          treatmentDecision
        }
      ]
    }),
    postingDecoderEnvelope
  );
  const nextRecoveryAllocation = Object.freeze({
    ...recoveryAllocation,
    treatmentAuthorityRef: Object.freeze({
      ...recoveryAllocation.treatmentAuthorityRef,
      canonicalDigest: treatmentDecision.canonicalDigest
    })
  });
  const allocationAuthority = rehashChargebackAllocation({
    ...base.allocationAuthority,
    positionTransitionRef: {
      kind: nextPosition.kind,
      bindingId: nextPosition.bindingId,
      nextPositionVersion: nextPosition.nextPositionVersion,
      bindingDigest: nextPosition.bindingDigest
    },
    recoveryAllocations: [nextRecoveryAllocation]
  }) as typeof base.allocationAuthority;
  return Object.freeze({
    ...base,
    allocationAuthority,
    principalPositionTransitionBinding: nextPosition
  });
}

function fullAllocation(base: ReturnType<typeof chargebackAllocationPostingFixture>) {
  const authority = base.allocationAuthority;
  const row = authority.platformAllocations[0];
  if (!row) throw new Error("missing platform allocation template");
  const basePosition = readUnverifiedChargebackPrincipalPositionTransitionBinding(
    base.principalPositionTransitionBinding,
    postingDecoderEnvelope
  );
  const decisionCore = Object.freeze({
    kind: "unverified_chargeback_treatment_decision" as const,
    schemaVersion: 1 as const,
    decisionId: "chargeback-resolution-platform-loss-treatment",
    version: 1,
    approvalStatus: "approved" as const,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: authority.chargebackCaseId,
    orderId: authority.orderId,
    astrologerUserId: authority.astrologerUserId,
    positionId: row.allocationId,
    treatment: "platform_loss" as const,
    approvedAmount: { amountMinor: 2_500, currency: "RUB" as const },
    policyId: "chargeback-resolution-platform-loss-policy",
    policyVersion: 1,
    proposedByActorUserId: "finance-maker-resolution",
    approvedByActorUserId: "finance-checker-resolution",
    approvedAt: authority.approvedAt
  });
  const treatmentDecision = Object.freeze({
    ...decisionCore,
    canonicalDigest: hashFinanceCommandPayload(decisionCore)
  });
  const platform = Object.freeze({
    ...row,
    accountCode: "platform_chargeback_loss" as const,
    amount: { amountMinor: 2_500, currency: "RUB" as const },
    originalJournalEntry: null,
    treatmentAuthorityRef: Object.freeze({
      kind: "chargeback_platform_loss_treatment" as const,
      authorityId: treatmentDecision.decisionId,
      version: 1,
      canonicalDigest: treatmentDecision.canonicalDigest
    })
  });
  const principalPositionTransitionBinding =
    readUnverifiedChargebackPrincipalPositionTransitionBinding(
      rehashChargebackPrincipalPosition({
        ...basePosition,
        caseExposure: {
          disputedPrincipal: authority.disputedPrincipal,
          allocatedBefore: { amountMinor: 0, currency: "RUB" },
          payableDelta: authority.payablePrincipal,
          recoveryDelta: authority.recoveryPrincipal,
          platformDelta: platform.amount,
          allocationDelta: { amountMinor: 5_000, currency: "RUB" },
          allocatedAfter: { amountMinor: 5_000, currency: "RUB" },
          unallocatedAfter: { amountMinor: 0, currency: "RUB" }
        },
        platformPositions: [
          {
            kind: "platform_loss",
            positionId: platform.allocationId,
            originalSaleId: platform.originalSaleId,
            componentId: platform.componentId,
            sourceCapacity: platform.amount,
            consumedBefore: { amountMinor: 0, currency: "RUB" },
            currentDelta: platform.amount,
            consumedAfter: platform.amount,
            remainingAfter: { amountMinor: 0, currency: "RUB" },
            treatmentDecision
          }
        ]
      }),
      postingDecoderEnvelope
    );
  const allocationAuthority = rehashChargebackAllocation({
    ...authority,
    positionTransitionRef: {
      kind: principalPositionTransitionBinding.kind,
      bindingId: principalPositionTransitionBinding.bindingId,
      nextPositionVersion: principalPositionTransitionBinding.nextPositionVersion,
      bindingDigest: principalPositionTransitionBinding.bindingDigest
    },
    platformPrincipal: platform.amount,
    principalAllocationDelta: { amountMinor: 5_000, currency: "RUB" },
    nextAllocatedPrincipal: { amountMinor: 5_000, currency: "RUB" },
    unallocatedSuspense: { amountMinor: 0, currency: "RUB" },
    platformAllocations: [platform]
  }) as typeof authority;
  return Object.freeze({ allocationAuthority, principalPositionTransitionBinding });
}
