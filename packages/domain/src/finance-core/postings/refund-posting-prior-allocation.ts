import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingVersion,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import type {
  RefundPostingAllocationAuthorityV1,
  RefundPostingPriorAllocationAuthorityRef
} from "./refund-posting-types";
import { readRefundPostingMoney } from "./refund-posting-value-codec";

export function readRefundPostingPriorAllocationAuthorityRef(
  input: unknown
): RefundPostingPriorAllocationAuthorityRef | null {
  if (input === null) return null;
  const fields = readExactDataRecord(input, [
    "kind",
    "authorityId",
    "version",
    "nextCumulativeRefunded",
    "nextCumulativePayableReversed",
    "nextCumulativePlatformReversed",
    "canonicalDigest"
  ]);
  if (fields.kind !== "refund_posting_allocation_authority") mismatch();
  return Object.freeze({
    kind: "refund_posting_allocation_authority" as const,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    nextCumulativeRefunded: readRefundPostingMoney(fields.nextCumulativeRefunded, false),
    nextCumulativePayableReversed: readRefundPostingMoney(
      fields.nextCumulativePayableReversed,
      false
    ),
    nextCumulativePlatformReversed: readRefundPostingMoney(
      fields.nextCumulativePlatformReversed,
      false
    ),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

export function assertRefundPostingPriorAllocationRef(
  current: Omit<RefundPostingAllocationAuthorityV1, "allocationDigest">
): void {
  const prior = current.priorAllocationAuthorityRef;
  if (current.version === 1) {
    if (
      prior !== null ||
      current.priorCumulativeRefunded.amountMinor !== 0 ||
      current.priorCumulativePayableReversed.amountMinor !== 0 ||
      current.priorCumulativePlatformReversed.amountMinor !== 0
    ) {
      mismatch();
    }
    return;
  }
  if (prior === null || prior.version !== current.version - 1) {
    mismatch();
  }
}

export function assertRefundPostingPriorAllocationAuthorityResolved(
  current: RefundPostingAllocationAuthorityV1,
  resolvedPrior: RefundPostingAllocationAuthorityV1 | null
): void {
  const reference = current.priorAllocationAuthorityRef;
  if (reference === null) {
    if (resolvedPrior !== null) mismatch();
    return;
  }
  if (
    resolvedPrior === null ||
    resolvedPrior.authorityId !== reference.authorityId ||
    resolvedPrior.version !== reference.version ||
    resolvedPrior.allocationDigest !== reference.canonicalDigest ||
    !sameMoney(resolvedPrior.nextCumulativeRefunded, reference.nextCumulativeRefunded) ||
    !sameMoney(
      resolvedPrior.nextCumulativePayableReversed,
      reference.nextCumulativePayableReversed
    ) ||
    !sameMoney(
      resolvedPrior.nextCumulativePlatformReversed,
      reference.nextCumulativePlatformReversed
    ) ||
    resolvedPrior.orderId !== current.orderId ||
    resolvedPrior.astrologerUserId !== current.astrologerUserId ||
    !sameCanonicalFinancePostingValue(resolvedPrior.providerAccount, current.providerAccount) ||
    resolvedPrior.providerPaymentId !== current.providerPaymentId ||
    resolvedPrior.orderEconomicsDigest !== current.orderEconomicsDigest ||
    !sameMoney(resolvedPrior.capturedGross, current.capturedGross) ||
    !sameMoney(resolvedPrior.capturedPayable, current.capturedPayable) ||
    !sameMoney(resolvedPrior.capturedPlatformCommission, current.capturedPlatformCommission)
  ) {
    mismatch();
  }
  if (compareFinancePostingInstants(current.approvedAt, resolvedPrior.approvedAt) < 0) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }
}

function sameMoney(
  left: { amountMinor: number; currency: string },
  right: { amountMinor: number; currency: string }
): boolean {
  return left.amountMinor === right.amountMinor && left.currency === right.currency;
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
