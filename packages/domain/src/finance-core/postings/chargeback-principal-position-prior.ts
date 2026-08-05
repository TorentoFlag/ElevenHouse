import { sameProviderAccountIdentityBinding } from "../provider-account-binding";
import type { ChargebackPrincipalPostingAllocationAuthority } from "./chargeback-posting-allocation-types";
import type { UnverifiedChargebackPrincipalPositionTransitionBinding } from "./chargeback-principal-position-types";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  sameCanonicalFinancePostingValue
} from "./posting-codec";

export function assertChargebackPrincipalPositionPriorResolved(
  current: UnverifiedChargebackPrincipalPositionTransitionBinding,
  prior: UnverifiedChargebackPrincipalPositionTransitionBinding | null
): void {
  const ref = current.previousBindingRef;
  if (current.expectedPositionVersion === "0") {
    if (ref !== null || prior !== null || current.caseExposure.allocatedBefore.amountMinor !== 0) {
      mismatch("authority_mismatch");
    }
    assertInitialPositions(current);
    return;
  }
  if (
    ref === null ||
    prior === null ||
    ref.bindingId !== prior.bindingId ||
    ref.nextPositionVersion !== prior.nextPositionVersion ||
    ref.bindingDigest !== prior.bindingDigest ||
    current.expectedPositionVersion !== prior.nextPositionVersion ||
    current.positionId !== prior.positionId ||
    current.chargebackCaseId !== prior.chargebackCaseId ||
    current.orderId !== prior.orderId ||
    current.astrologerUserId !== prior.astrologerUserId ||
    current.providerAccountId !== prior.providerAccountId ||
    current.accountingAllocationId !== prior.accountingAllocationId ||
    current.accountingAllocationVersion !== prior.accountingAllocationVersion + 1 ||
    current.caseExposure.allocatedBefore.amountMinor !==
      prior.caseExposure.allocatedAfter.amountMinor ||
    compareFinancePostingInstants(current.observedAt, prior.observedAt) < 0
  ) {
    mismatch("authority_mismatch");
  }
  assertConfirmedBasisAdvanced(current, prior);
  assertPositionSnapshotsAdvanced(current, prior);
}

export function assertChargebackPrincipalPriorChainsAligned(
  currentAllocation: ChargebackPrincipalPostingAllocationAuthority,
  priorAllocation: ChargebackPrincipalPostingAllocationAuthority | null,
  currentPosition: UnverifiedChargebackPrincipalPositionTransitionBinding,
  priorPosition: UnverifiedChargebackPrincipalPositionTransitionBinding | null
): void {
  if (
    currentAllocation.positionTransitionRef.bindingId !== currentPosition.bindingId ||
    currentAllocation.positionTransitionRef.nextPositionVersion !==
      currentPosition.nextPositionVersion ||
    currentAllocation.positionTransitionRef.bindingDigest !== currentPosition.bindingDigest
  ) {
    mismatch("authority_mismatch");
  }
  if (priorAllocation === null || priorPosition === null) {
    if (priorAllocation !== null || priorPosition !== null) mismatch("authority_mismatch");
    return;
  }
  const priorRef = priorAllocation.positionTransitionRef;
  if (
    priorRef.bindingId !== priorPosition.bindingId ||
    priorRef.nextPositionVersion !== priorPosition.nextPositionVersion ||
    priorRef.bindingDigest !== priorPosition.bindingDigest ||
    priorPosition.accountingAllocationRevisionId !== priorAllocation.authorityId ||
    priorPosition.accountingAllocationVersion !== priorAllocation.version
  ) {
    mismatch("authority_mismatch");
  }
}

function assertInitialPositions(
  current: UnverifiedChargebackPrincipalPositionTransitionBinding
): void {
  if (
    current.recoveryPositions.some((position) => position.consumedBefore.amountMinor !== 0) ||
    current.platformPositions.some((position) =>
      position.kind === "platform_loss"
        ? position.consumedBefore.amountMinor !== 0
        : position.reversedBefore.amountMinor !== 0
    )
  ) {
    mismatch("authority_mismatch");
  }
}

function assertConfirmedBasisAdvanced(
  current: UnverifiedChargebackPrincipalPositionTransitionBinding,
  prior: UnverifiedChargebackPrincipalPositionTransitionBinding
): void {
  const next = current.confirmedBasis;
  const previous = prior.confirmedBasis;
  if (
    next.restrictionId !== previous.restrictionId ||
    !sameProviderAccountIdentityBinding(next.providerAccount, previous.providerAccount) ||
    next.providerPaymentId !== previous.providerPaymentId ||
    next.restrictionVersion < previous.restrictionVersion ||
    next.cumulativeDisputedAmount.amountMinor < previous.cumulativeDisputedAmount.amountMinor ||
    compareFinancePostingInstants(next.confirmedAt, previous.confirmedAt) < 0 ||
    (next.restrictionVersion === previous.restrictionVersion &&
      !sameCanonicalFinancePostingValue(next, previous))
  ) {
    mismatch("authority_mismatch");
  }
}

function assertPositionSnapshotsAdvanced(
  current: UnverifiedChargebackPrincipalPositionTransitionBinding,
  prior: UnverifiedChargebackPrincipalPositionTransitionBinding
): void {
  const priorPositions = [...prior.recoveryPositions, ...prior.platformPositions];
  const currentById = new Map(
    [...current.recoveryPositions, ...current.platformPositions].map((position) => [
      position.positionId,
      position
    ])
  );
  for (const previous of priorPositions) {
    const next = currentById.get(previous.positionId);
    if (!next || next.kind !== previous.kind) mismatch("authority_mismatch");
    if (previous.kind === "paid_recovery" && next.kind === "paid_recovery") {
      if (
        next.consumedBefore.amountMinor !== previous.consumedAfter.amountMinor ||
        !sameRecoveryIdentity(next, previous)
      ) {
        mismatch("authority_mismatch");
      }
    } else if (previous.kind === "platform_loss" && next?.kind === "platform_loss") {
      if (
        next.consumedBefore.amountMinor !== previous.consumedAfter.amountMinor ||
        !samePlatformLossIdentity(next, previous)
      ) {
        mismatch("authority_mismatch");
      }
    } else if (previous.kind === "platform_commission_reversal" && next?.kind === previous.kind) {
      if (
        next.deferredRemainingBefore.amountMinor !== previous.deferredRemainingAfter.amountMinor ||
        next.revenueRemainingBefore.amountMinor !== previous.revenueRemainingAfter.amountMinor ||
        next.reversedBefore.amountMinor !== previous.reversedAfter.amountMinor ||
        !samePlatformIdentity(next, previous)
      ) {
        mismatch("authority_mismatch");
      }
    } else mismatch("authority_mismatch");
  }
  for (const next of currentById.values()) {
    const existed = priorPositions.some((position) => position.positionId === next.positionId);
    if (
      !existed &&
      (next.kind === "platform_commission_reversal"
        ? next.reversedBefore.amountMinor !== 0
        : next.consumedBefore.amountMinor !== 0)
    ) {
      mismatch("authority_mismatch");
    }
  }
}

function samePlatformLossIdentity(
  left: Extract<
    UnverifiedChargebackPrincipalPositionTransitionBinding["platformPositions"][number],
    { kind: "platform_loss" }
  >,
  right: typeof left
): boolean {
  return (
    left.originalSaleId === right.originalSaleId &&
    left.componentId === right.componentId &&
    sameCanonicalFinancePostingValue(left.sourceCapacity, right.sourceCapacity) &&
    sameCanonicalFinancePostingValue(left.treatmentDecision, right.treatmentDecision)
  );
}

function sameRecoveryIdentity(
  left: UnverifiedChargebackPrincipalPositionTransitionBinding["recoveryPositions"][number],
  right: typeof left
): boolean {
  return (
    left.originalSaleId === right.originalSaleId &&
    left.componentId === right.componentId &&
    left.payableLotId === right.payableLotId &&
    left.payoutRequestId === right.payoutRequestId &&
    left.payoutAllocationId === right.payoutAllocationId &&
    sameCanonicalFinancePostingValue(left.sourceCapacity, right.sourceCapacity) &&
    sameCanonicalFinancePostingValue(left.paidEvidence, right.paidEvidence) &&
    sameCanonicalFinancePostingValue(left.treatmentDecision, right.treatmentDecision)
  );
}

function samePlatformIdentity(
  left: Extract<
    UnverifiedChargebackPrincipalPositionTransitionBinding["platformPositions"][number],
    { kind: "platform_commission_reversal" }
  >,
  right: typeof left
): boolean {
  return (
    left.originalSaleId === right.originalSaleId &&
    left.componentId === right.componentId &&
    left.debitAccount === right.debitAccount &&
    sameCanonicalFinancePostingValue(left.originalJournalEntry, right.originalJournalEntry) &&
    sameCanonicalFinancePostingValue(
      left.originalCommissionAmount,
      right.originalCommissionAmount
    ) &&
    sameCanonicalFinancePostingValue(
      left.ledgerPositionAuthorityRef,
      right.ledgerPositionAuthorityRef
    )
  );
}

function mismatch(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
