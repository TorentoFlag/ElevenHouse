import { sameProviderAccountIdentityBinding } from "../provider-account-binding";
import type { ChargebackPrincipalPostingAllocationAuthority } from "./chargeback-posting-allocation-types";
import type { UnverifiedChargebackPrincipalPositionTransitionBinding } from "./chargeback-principal-position-types";
import { FinancePostingIntegrityError, sameCanonicalFinancePostingValue } from "./posting-codec";
import type { UnverifiedReceiptLinkedPostingProjection } from "./receipt-linked-posting-projection";

export function assertChargebackPrincipalPositionMatchesAllocation(
  position: UnverifiedChargebackPrincipalPositionTransitionBinding,
  authority: ChargebackPrincipalPostingAllocationAuthority,
  projection: UnverifiedReceiptLinkedPostingProjection
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
    position.confirmedBasis.restrictionId !== provider.sourceAuthority.restrictionId ||
    position.confirmedBasis.confirmationAuthorityId !== provider.sourceAuthority.authorityId ||
    position.confirmedBasis.confirmationAuthorityVersion !== provider.sourceAuthority.version ||
    !sameProviderAccountIdentityBinding(
      position.confirmedBasis.providerAccount,
      provider.sourceAuthority.providerAccount
    ) ||
    position.confirmedBasis.providerPaymentId !== provider.sourceAuthority.providerPaymentId ||
    position.confirmedBasis.canonicalEvidenceId !== provider.sourceAuthority.canonicalEvidenceId ||
    position.confirmedBasis.confirmedAt !== provider.sourceAuthority.confirmedAt ||
    !sameCanonicalFinancePostingValue(
      position.confirmedBasis.cumulativeDisputedAmount,
      provider.sourceAuthority.nextCumulativeDisputedAmount
    )
  ) {
    mismatch("authority_mismatch");
  }
  const exposure = position.caseExposure;
  const payableMinor = projection.rows.reduce(
    (sum, row) => sum + BigInt(row.entry.amount.amountMinor),
    0n
  );
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
    exposure.unallocatedAfter.amountMinor !== authority.unallocatedSuspense.amountMinor ||
    payableMinor !== BigInt(exposure.payableDelta.amountMinor)
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
      row.currentDelta.amountMinor !== allocation.amount.amountMinor ||
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
      row.currentDelta.amountMinor !== allocation.amount.amountMinor
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
