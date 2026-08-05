import { describe, expect, it } from "vitest";

import { admitRefundResultExecutionProposal } from "./refund-result-execution-admission";
import { buildRefundFailedPosting } from "./postings/refund-terminal-posting";
import { receiptDecoderEnvelope } from "./postings/payable-lot-posting-link-test-fixtures";
import { buildRefundFundingApprovalFixture } from "./postings/refund-position-test-fixtures";
import { buildZeroPayableRefundFixture } from "./postings/refund-posting-bridge-test-fixtures";
import { refundPostingDecoderEnvelope } from "./postings/refund-posting-test-fixtures";
import { FinancePostingIntegrityError } from "./postings/posting-codec";

describe("admitRefundResultExecutionProposal", () => {
  it("rehydrates the approved reservation graph and rejects a drifted terminal binding", () => {
    const fixture = buildZeroPayableRefundFixture("failed");
    if (!fixture.terminalAuthority || !fixture.terminalEvidenceBinding) {
      throw new Error("missing failed refund terminal fixture");
    }
    const terminalPosting = buildRefundFailedPosting(
      {
        allocation: fixture.allocation,
        resolvedPriorAllocation: fixture.resolvedPriorAllocation,
        resolvedCumulativePosition: fixture.resolvedCumulativePosition,
        fundingTransitionBinding: fixture.fundingTransitionBinding,
        terminalAuthority: fixture.terminalAuthority,
        terminalEvidenceBinding: fixture.terminalEvidenceBinding,
        operationReceipt: fixture.operationReceipt,
        postingIdentity: fixture.postingIdentity
      },
      refundPostingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    const approved = buildRefundFundingApprovalFixture(fixture.allocation);
    const input = {
      kind: "refund_result_execution_proposal" as const,
      allocation: fixture.allocation,
      resolvedPriorAllocation: fixture.resolvedPriorAllocation,
      resolvedCumulativePosition: fixture.resolvedCumulativePosition,
      resolvedFundingPositions: approved.binding.transitions.map(
        (transition) => transition.nextPosition
      ),
      fundingTransitionBinding: fixture.fundingTransitionBinding,
      terminalAuthority: fixture.terminalAuthority,
      terminalEvidenceBinding: fixture.terminalEvidenceBinding,
      terminalPosting,
      walletJournalMutation: null
    };

    expect(admitRefundResultExecutionProposal(input, refundPostingDecoderEnvelope)).toMatchObject({
      kind: "refund_result_execution_proposal",
      terminalAuthority: { kind: "refund_failed" },
      terminalPosting: { kind: "refund_state_only", fundingDisposition: "released" }
    });
    expect(() =>
      admitRefundResultExecutionProposal(
        {
          ...input,
          fundingTransitionBinding: {
            ...input.fundingTransitionBinding,
            bindingId: "forged-terminal-binding"
          }
        },
        refundPostingDecoderEnvelope
      )
    ).toThrow(FinancePostingIntegrityError);
  });
});
