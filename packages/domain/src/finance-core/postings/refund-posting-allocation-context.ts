import { sameCanonicalFinancePostingValue, FinancePostingIntegrityError } from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { readAndAssertRefundCumulativePosition } from "./refund-cumulative-position";
import { readUnverifiedRefundFundingTransitionBinding } from "./refund-funding-position-transition";
import { readRefundPostingAllocationAuthority } from "./refund-posting-allocation-codec";
import { assertRefundPostingPriorAllocationAuthorityResolved } from "./refund-posting-prior-allocation";

export function readRefundPostingAllocationContext(
  input: Readonly<{
    allocation: unknown;
    resolvedPriorAllocation: unknown;
    resolvedCumulativePosition: unknown;
    fundingTransitionBinding: unknown;
  }>,
  envelope: FinancePostingDecoderEnvelope
) {
  const allocation = readRefundPostingAllocationAuthority(input.allocation, envelope);
  const resolvedPriorAllocation =
    input.resolvedPriorAllocation === null
      ? null
      : readRefundPostingAllocationAuthority(input.resolvedPriorAllocation, envelope);
  assertRefundPostingPriorAllocationAuthorityResolved(allocation, resolvedPriorAllocation);
  const resolvedCumulativePosition = readAndAssertRefundCumulativePosition(
    input.resolvedCumulativePosition,
    allocation,
    envelope
  );
  const fundingTransitionBinding = readUnverifiedRefundFundingTransitionBinding(
    input.fundingTransitionBinding,
    envelope
  );
  if (
    !sameCanonicalFinancePostingValue(fundingTransitionBinding.allocationAuthorityRef, {
      kind: allocation.kind,
      authorityId: allocation.authorityId,
      version: allocation.version,
      canonicalDigest: allocation.allocationDigest
    })
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  return Object.freeze({
    allocation,
    resolvedPriorAllocation,
    resolvedCumulativePosition,
    fundingTransitionBinding
  });
}
