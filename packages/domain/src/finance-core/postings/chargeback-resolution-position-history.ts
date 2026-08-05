import { sameProviderAccountIdentityBinding } from "../provider-account-binding";
import type { ChargebackPrincipalPostingAllocationAuthority } from "./chargeback-posting-allocation-types";
import {
  assertChargebackPrincipalPositionPriorResolved,
  readUnverifiedChargebackPrincipalPositionTransitionBinding
} from "./chargeback-principal-position";
import type { UnverifiedChargebackPrincipalPositionTransitionBinding } from "./chargeback-principal-position-types";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";

export function readChargebackResolutionPositionHistory(
  allocations: readonly ChargebackPrincipalPostingAllocationAuthority[],
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): readonly UnverifiedChargebackPrincipalPositionTransitionBinding[] {
  const values = readExactDataArray(input, 1, envelope.maxAllocations);
  if (values.length !== allocations.length) mismatch("authority_mismatch");
  const positions = values.map((value) =>
    readUnverifiedChargebackPrincipalPositionTransitionBinding(value, envelope)
  );
  positions.forEach((position, index) => {
    const allocation = allocations[index];
    if (!allocation) mismatch("authority_mismatch");
    assertChargebackPrincipalPositionPriorResolved(
      position,
      index === 0 ? null : (positions[index - 1] ?? null)
    );
    assertPositionMatchesAllocation(position, allocation);
  });
  return Object.freeze(positions);
}

function assertPositionMatchesAllocation(
  position: UnverifiedChargebackPrincipalPositionTransitionBinding,
  authority: ChargebackPrincipalPostingAllocationAuthority
): void {
  const ref = authority.positionTransitionRef;
  const source = authority.sourceAuthority;
  const provider = authority.confirmedProviderEvidenceBinding;
  if (
    ref.bindingId !== position.bindingId ||
    ref.nextPositionVersion !== position.nextPositionVersion ||
    ref.bindingDigest !== position.bindingDigest ||
    position.chargebackCaseId !== authority.chargebackCaseId ||
    position.orderId !== authority.orderId ||
    position.astrologerUserId !== authority.astrologerUserId ||
    position.providerAccountId !== authority.arcProviderAccountId ||
    position.accountingAllocationId !== source.accountingAllocationId ||
    position.accountingAllocationRevisionId !== source.accountingAllocationRevisionId ||
    position.accountingAllocationVersion !== source.accountingAllocationVersion ||
    position.providerEvidenceBindingDigest !== provider.bindingDigest ||
    position.observedAt !== authority.approvedAt ||
    !sameCanonicalFinancePostingValue(position.confirmedBasis, source.confirmedBasis) ||
    !sameCanonicalFinancePostingValue(
      position.confirmedBasis.cumulativeDisputedAmount,
      authority.disputedPrincipal
    ) ||
    position.confirmedBasis.confirmationId !== provider.sourceAuthority.confirmationId ||
    position.confirmedBasis.confirmationAuthorityId !== provider.sourceAuthority.authorityId ||
    position.confirmedBasis.confirmationAuthorityVersion !== provider.sourceAuthority.version ||
    position.confirmedBasis.restrictionId !== provider.sourceAuthority.restrictionId ||
    !sameProviderAccountIdentityBinding(
      position.confirmedBasis.providerAccount,
      provider.sourceAuthority.providerAccount
    ) ||
    position.confirmedBasis.providerPaymentId !== provider.sourceAuthority.providerPaymentId ||
    position.confirmedBasis.canonicalEvidenceId !== provider.sourceAuthority.canonicalEvidenceId ||
    position.confirmedBasis.confirmedAt !== provider.sourceAuthority.confirmedAt
  ) {
    mismatch("authority_mismatch");
  }
  const exposure = position.caseExposure;
  if (
    exposure.disputedPrincipal.amountMinor !== authority.disputedPrincipal.amountMinor ||
    exposure.allocatedBefore.amountMinor !==
      authority.nextAllocatedPrincipal.amountMinor -
        authority.principalAllocationDelta.amountMinor ||
    exposure.payableDelta.amountMinor !== authority.payablePrincipal.amountMinor ||
    exposure.recoveryDelta.amountMinor !== authority.recoveryPrincipal.amountMinor ||
    exposure.platformDelta.amountMinor !== authority.platformPrincipal.amountMinor ||
    exposure.allocationDelta.amountMinor !== authority.principalAllocationDelta.amountMinor ||
    exposure.allocatedAfter.amountMinor !== authority.nextAllocatedPrincipal.amountMinor ||
    exposure.unallocatedAfter.amountMinor !== authority.unallocatedSuspense.amountMinor
  ) {
    mismatch("amount_mismatch");
  }
  assertRecoveryRows(position, authority);
  assertPlatformRows(position, authority);
}

function assertRecoveryRows(
  position: UnverifiedChargebackPrincipalPositionTransitionBinding,
  authority: ChargebackPrincipalPostingAllocationAuthority
): void {
  const changed = position.recoveryPositions.filter((row) => row.currentDelta.amountMinor > 0);
  if (changed.length !== authority.recoveryAllocations.length) mismatch("authority_mismatch");
  for (const allocation of authority.recoveryAllocations) {
    const row = changed.find((candidate) => candidate.positionId === allocation.allocationId);
    if (
      !row ||
      row.originalSaleId !== allocation.originalSaleId ||
      row.componentId !== allocation.componentId ||
      row.payableLotId !== allocation.payableLotId ||
      row.payoutRequestId !== allocation.payoutRequestId ||
      row.payoutAllocationId !== allocation.payoutAllocationId ||
      !sameCanonicalFinancePostingValue(row.currentDelta, allocation.amount) ||
      row.treatmentDecision.decisionId !== allocation.treatmentAuthorityRef.authorityId ||
      row.treatmentDecision.version !== allocation.treatmentAuthorityRef.version ||
      row.treatmentDecision.canonicalDigest !== allocation.treatmentAuthorityRef.canonicalDigest
    ) {
      mismatch("authority_mismatch");
    }
  }
}

function assertPlatformRows(
  position: UnverifiedChargebackPrincipalPositionTransitionBinding,
  authority: ChargebackPrincipalPostingAllocationAuthority
): void {
  const changed = position.platformPositions.filter((row) => row.currentDelta.amountMinor > 0);
  if (changed.length !== authority.platformAllocations.length) mismatch("authority_mismatch");
  for (const allocation of authority.platformAllocations) {
    const row = changed.find((candidate) => candidate.positionId === allocation.allocationId);
    if (
      !row ||
      row.originalSaleId !== allocation.originalSaleId ||
      row.componentId !== allocation.componentId ||
      !sameCanonicalFinancePostingValue(row.currentDelta, allocation.amount)
    ) {
      mismatch("authority_mismatch");
    }
    if (allocation.accountCode === "platform_chargeback_loss") {
      if (
        row.kind !== "platform_loss" ||
        row.treatmentDecision.decisionId !== allocation.treatmentAuthorityRef.authorityId ||
        row.treatmentDecision.version !== allocation.treatmentAuthorityRef.version ||
        row.treatmentDecision.canonicalDigest !== allocation.treatmentAuthorityRef.canonicalDigest
      ) {
        mismatch("authority_mismatch");
      }
    } else if (
      row.kind !== "platform_commission_reversal" ||
      row.debitAccount !== allocation.accountCode ||
      !sameCanonicalFinancePostingValue(
        row.originalJournalEntry,
        allocation.originalJournalEntry
      ) ||
      !sameCanonicalFinancePostingValue(
        row.ledgerPositionAuthorityRef,
        allocation.treatmentAuthorityRef
      )
    ) {
      mismatch("authority_mismatch");
    }
  }
}

function mismatch(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
