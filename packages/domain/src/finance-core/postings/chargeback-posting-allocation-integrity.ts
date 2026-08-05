import type { ChargebackPrincipalPostingAllocationAuthority } from "./chargeback-posting-allocation-types";
import {
  assertFinancePostingMoneyEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError
} from "./posting-codec";

type AllocationCore = Omit<ChargebackPrincipalPostingAllocationAuthority, "canonicalDigest">;

export function assertChargebackPostingAllocationIdentity(authority: AllocationCore): void {
  const source = authority.sourceAuthority;
  const confirmed = authority.confirmedProviderEvidenceBinding;
  if (
    authority.authorityId !== source.accountingAllocationRevisionId ||
    authority.version !== source.accountingAllocationVersion ||
    authority.chargebackCaseId !== source.chargebackCaseId ||
    authority.orderId !== source.orderId ||
    authority.astrologerUserId !== source.astrologerUserId ||
    confirmed.sourceAuthority.chargebackCaseId !== authority.chargebackCaseId ||
    confirmed.sourceAuthority.orderId !== authority.orderId ||
    confirmed.sourceAuthority.astrologerUserId !== authority.astrologerUserId
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  if (confirmed.providerEvidence.providerAccountId !== authority.arcProviderAccountId) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  assertFinancePostingMoneyEqual(
    authority.payablePrincipal,
    source.payableAmount,
    "authority_mismatch"
  );
  assertFinancePostingMoneyEqual(
    authority.disputedPrincipal,
    confirmed.sourceAuthority.nextCumulativeDisputedAmount,
    "evidence_mismatch"
  );
  if (
    compareFinancePostingInstants(authority.approvedAt, confirmed.sourceAuthority.confirmedAt) < 0
  ) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }
}

export function assertChargebackPostingAllocationAmounts(authority: AllocationCore): void {
  const recovery = sum(authority.recoveryAllocations.map((row) => row.amount.amountMinor));
  const platform = sum(authority.platformAllocations.map((row) => row.amount.amountMinor));
  const payable = BigInt(authority.payablePrincipal.amountMinor);
  const delta = payable + recovery + platform;
  const prior = BigInt(
    authority.priorAllocationAuthorityRef?.nextAllocatedPrincipal.amountMinor ?? 0
  );
  const next = prior + delta;
  if (
    recovery !== BigInt(authority.recoveryPrincipal.amountMinor) ||
    platform !== BigInt(authority.platformPrincipal.amountMinor) ||
    delta === 0n ||
    delta !== BigInt(authority.principalAllocationDelta.amountMinor) ||
    next !== BigInt(authority.nextAllocatedPrincipal.amountMinor) ||
    next + BigInt(authority.unallocatedSuspense.amountMinor) !==
      BigInt(authority.disputedPrincipal.amountMinor)
  ) {
    throw new FinancePostingIntegrityError("amount_mismatch");
  }
}

const sum = (values: readonly number[]): bigint =>
  values.reduce((total, value) => total + BigInt(value), 0n);
