import { readChargebackRecoveryPostingAllocationAuthority } from "./chargeback-recovery-posting-authority";
import type { ChargebackRecoveryPostingAllocationAuthority } from "./chargeback-recovery-posting-types";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataArray,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";

export function readChargebackRecoveryPriorHistory(
  current: ChargebackRecoveryPostingAllocationAuthority,
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): readonly ChargebackRecoveryPostingAllocationAuthority[] {
  const prior = readExactDataArray(input, 0, envelope.maxAllocations).map((value) =>
    readChargebackRecoveryPostingAllocationAuthority(value, envelope)
  );
  if (prior.length !== current.version - 1) mismatch("authority_mismatch");
  const full = Object.freeze([...prior, current]);
  full.forEach((authority, index) =>
    assertChargebackRecoveryPriorAuthority(authority, index === 0 ? null : full[index - 1]!)
  );
  assertChargebackRecoveryHistoryFresh(full);
  return Object.freeze(prior);
}

export function assertChargebackRecoveryHistoryFresh(
  authorities: readonly ChargebackRecoveryPostingAllocationAuthority[]
): void {
  const unique = (values: readonly string[]) => new Set(values).size === values.length;
  if (
    !unique(authorities.map((row) => row.authorityId)) ||
    !unique(authorities.map((row) => row.sourceAuthority.authorityId)) ||
    !unique(authorities.map((row) => row.sourceAuthority.recoveryCollectionId)) ||
    !unique(authorities.map((row) => row.operationReceiptId)) ||
    !unique(authorities.map((row) => row.sourceAuthority.accountingAllocationId)) ||
    !unique(authorities.map((row) => row.sourceAuthority.canonicalEvidenceId))
  ) {
    mismatch("authority_mismatch");
  }
}

export function assertChargebackRecoveryPriorAuthority(
  current: ChargebackRecoveryPostingAllocationAuthority,
  resolvedPrior: ChargebackRecoveryPostingAllocationAuthority | null
): void {
  const reference = current.priorAuthorityRef;
  if (current.version === 1) {
    if (
      reference !== null ||
      resolvedPrior !== null ||
      current.exposures.some((row) => row.priorCollectedAmount.amountMinor !== 0)
    ) {
      mismatch("authority_mismatch");
    }
    return;
  }
  if (
    !reference ||
    !resolvedPrior ||
    reference.authorityId !== resolvedPrior.authorityId ||
    reference.version !== resolvedPrior.version ||
    reference.canonicalDigest !== resolvedPrior.canonicalDigest ||
    resolvedPrior.version !== current.version - 1 ||
    resolvedPrior.chargebackCaseId !== current.chargebackCaseId ||
    resolvedPrior.originalOrderId !== current.originalOrderId ||
    resolvedPrior.astrologerUserId !== current.astrologerUserId ||
    resolvedPrior.arcProviderAccountId !== current.arcProviderAccountId ||
    resolvedPrior.providerPaymentId !== current.providerPaymentId ||
    compareFinancePostingInstants(current.collectedAt, resolvedPrior.collectedAt) < 0
  ) {
    mismatch("authority_mismatch");
  }
  assertExposureHistory(current, resolvedPrior);
  assertAllocationHistory(current, resolvedPrior);
  if (
    resolvedPrior.latestOutcomeEvidenceRef &&
    !sameCanonicalFinancePostingValue(
      resolvedPrior.latestOutcomeEvidenceRef,
      current.latestOutcomeEvidenceRef
    )
  ) {
    mismatch("authority_mismatch");
  }
}

function assertExposureHistory(
  current: ChargebackRecoveryPostingAllocationAuthority,
  prior: ChargebackRecoveryPostingAllocationAuthority
): void {
  for (const previous of prior.exposures) {
    const next = current.exposures.find((row) => row.exposureId === previous.exposureId);
    if (
      !next ||
      next.priorCollectedAmount.amountMinor !== previous.nextCollectedAmount.amountMinor ||
      next.originalComponentId !== previous.originalComponentId ||
      next.originalSaleId !== previous.originalSaleId ||
      next.payableLotId !== previous.payableLotId ||
      next.payoutAllocationId !== previous.payoutAllocationId ||
      !sameCanonicalFinancePostingValue(next.sourceCapacity, previous.sourceCapacity) ||
      next.allocatedAmount.amountMinor < previous.allocatedAmount.amountMinor
    ) {
      mismatch("authority_mismatch");
    }
  }
  for (const added of current.exposures) {
    if (
      !prior.exposures.some((row) => row.exposureId === added.exposureId) &&
      added.priorCollectedAmount.amountMinor !== 0
    ) {
      mismatch("authority_mismatch");
    }
  }
}

function assertAllocationHistory(
  current: ChargebackRecoveryPostingAllocationAuthority,
  prior: ChargebackRecoveryPostingAllocationAuthority
): void {
  if (
    prior.allocationRefs.some(
      (reference, index) =>
        !sameCanonicalFinancePostingValue(reference, current.allocationRefs[index])
    ) ||
    prior.tranches.some((previous) => {
      const next = current.tranches.find(
        (candidate) =>
          candidate.allocationAuthorityId === previous.allocationAuthorityId &&
          candidate.exposureId === previous.exposureId
      );
      return !sameCanonicalFinancePostingValue(previous, next);
    })
  ) {
    mismatch("authority_mismatch");
  }
}

function mismatch(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
