import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingVersion
} from "./posting-codec";
import type {
  ChargebackPrincipalPostingAllocationAuthority,
  ChargebackPrincipalPostingPriorAllocationAuthorityRef
} from "./chargeback-posting-allocation-types";
import { readChargebackUnsignedMoney } from "./chargeback-posting-value-codec";

export function readChargebackPrincipalPostingPriorAllocationAuthorityRef(
  input: unknown
): ChargebackPrincipalPostingPriorAllocationAuthorityRef | null {
  if (input === null) return null;
  const fields = readExactDataRecord(input, [
    "kind",
    "authorityId",
    "accountingAllocationId",
    "version",
    "nextAllocatedPrincipal",
    "canonicalDigest"
  ]);
  if (fields.kind !== "chargeback_principal_posting_allocation") {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  return Object.freeze({
    kind: "chargeback_principal_posting_allocation" as const,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    accountingAllocationId: readFinancePostingIdentifier(fields.accountingAllocationId),
    version: readFinancePostingVersion(fields.version),
    nextAllocatedPrincipal: readChargebackUnsignedMoney(fields.nextAllocatedPrincipal),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

export function assertChargebackPrincipalPostingPriorAllocationRef(
  current: Omit<ChargebackPrincipalPostingAllocationAuthority, "canonicalDigest">
): void {
  const prior = current.priorAllocationAuthorityRef;
  const source = current.sourceAuthority;
  if (current.version === 1) {
    if (prior !== null) {
      throw new FinancePostingIntegrityError("authority_mismatch");
    }
    return;
  }
  if (
    prior === null ||
    prior.accountingAllocationId !== source.accountingAllocationId ||
    prior.version !== current.version - 1 ||
    prior.authorityId === current.authorityId
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
}

export function assertChargebackPrincipalPostingPriorAuthorityResolved(
  current: ChargebackPrincipalPostingAllocationAuthority,
  resolvedPrior: ChargebackPrincipalPostingAllocationAuthority | null
): void {
  const reference = current.priorAllocationAuthorityRef;
  if (reference === null) {
    if (resolvedPrior !== null) throw new FinancePostingIntegrityError("authority_mismatch");
    return;
  }
  if (
    resolvedPrior === null ||
    resolvedPrior.authorityId !== reference.authorityId ||
    resolvedPrior.sourceAuthority.accountingAllocationId !== reference.accountingAllocationId ||
    resolvedPrior.version !== reference.version ||
    resolvedPrior.canonicalDigest !== reference.canonicalDigest ||
    resolvedPrior.chargebackCaseId !== current.chargebackCaseId ||
    resolvedPrior.orderId !== current.orderId ||
    resolvedPrior.astrologerUserId !== current.astrologerUserId ||
    resolvedPrior.arcProviderAccountId !== current.arcProviderAccountId ||
    !moneyEqual(resolvedPrior.nextAllocatedPrincipal, reference.nextAllocatedPrincipal)
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  if (compareFinancePostingInstants(current.approvedAt, resolvedPrior.approvedAt) < 0) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }
}

function moneyEqual(
  left: { currency: string; amountMinor: number },
  right: {
    currency: string;
    amountMinor: number;
  }
): boolean {
  return left.currency === right.currency && left.amountMinor === right.amountMinor;
}
