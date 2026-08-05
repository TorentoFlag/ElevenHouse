import { describe, expect, it } from "vitest";
import { FinancePostingIntegrityError } from "./posting-codec";
import { readRefundPostingAllocationAuthority } from "./refund-posting-allocation-codec";
import { readRefundPostingAllocationContext } from "./refund-posting-allocation-context";
import {
  buildConfirmedRefundCumulativePositionInput,
  buildRefundPostingAllocationInput,
  buildSecondRefundPostingAllocationInput,
  refundPostingDecoderEnvelope
} from "./refund-posting-test-fixtures";
import { buildRefundFundingApprovalFixture } from "./refund-position-test-fixtures";

describe("refund posting allocation context", () => {
  it("requires the resolved adjacent authority and bounded source positions together", () => {
    const prior = readRefundPostingAllocationAuthority(
      buildRefundPostingAllocationInput(),
      refundPostingDecoderEnvelope
    );
    const current = readRefundPostingAllocationAuthority(
      buildSecondRefundPostingAllocationInput(prior),
      refundPostingDecoderEnvelope
    );
    const resolvedCumulativePosition = buildConfirmedRefundCumulativePositionInput(prior);
    const fundingTransitionBinding = buildRefundFundingApprovalFixture(current).binding;

    expect(() =>
      readRefundPostingAllocationContext(
        {
          allocation: current,
          resolvedPriorAllocation: prior,
          resolvedCumulativePosition,
          fundingTransitionBinding
        },
        refundPostingDecoderEnvelope
      )
    ).not.toThrow();

    expectReason(
      () =>
        readRefundPostingAllocationContext(
          {
            allocation: current,
            resolvedPriorAllocation: null,
            resolvedCumulativePosition,
            fundingTransitionBinding
          },
          refundPostingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });
});

function expectReason(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected finance posting error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}
