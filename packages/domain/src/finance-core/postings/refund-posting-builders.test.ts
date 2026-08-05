import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { digestValue } from "../source-lot-operation-receipt-core";
import { FinancePostingIntegrityError } from "./posting-codec";
import { receiptDecoderEnvelope } from "./payable-lot-posting-link-test-fixtures";
import {
  buildRefundApprovedPosting,
  buildRefundConfirmedPosting,
  buildRefundFailedPosting
} from "./refund-postings";
import {
  buildStandardRefundOperationFixture,
  receiptFor
} from "./refund-posting-builder-test-fixtures";
import { refundPostingDecoderEnvelope } from "./refund-posting-test-fixtures";

describe("refund posting builders", () => {
  it("rejects a hostile approval authority before invoking its traps", () => {
    const fixture = buildStandardRefundOperationFixture("refund_approved");
    let traps = 0;
    const approvalAuthority = new Proxy(fixture.approvalAuthority, {
      getPrototypeOf() {
        traps += 1;
        throw new Error("must not execute");
      },
      ownKeys() {
        traps += 1;
        throw new Error("must not execute");
      }
    });

    expectPostingReason(
      () =>
        buildRefundApprovedPosting(
          {
            allocation: fixture.allocation,
            resolvedPriorAllocation: fixture.resolvedPriorAllocation,
            resolvedCumulativePosition: fixture.resolvedCumulativePosition,
            fundingTransitionBinding: fixture.fundingTransitionBinding,
            approvalAuthority,
            operationReceipt: fixture.operationReceipt,
            postingIdentity: fixture.postingIdentity
          },
          refundPostingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "invalid_shape"
    );
    expect(traps).toBe(0);

    let moneyTraps = 0;
    const nestedApproval = {
      ...fixture.approvalAuthority,
      payableAmount: new Proxy(fixture.approvalAuthority.payableAmount, {
        getPrototypeOf() {
          moneyTraps += 1;
          throw new Error("must not execute");
        },
        ownKeys() {
          moneyTraps += 1;
          throw new Error("must not execute");
        }
      })
    };
    expectPostingReason(
      () =>
        buildRefundApprovedPosting(
          {
            allocation: fixture.allocation,
            resolvedPriorAllocation: fixture.resolvedPriorAllocation,
            resolvedCumulativePosition: fixture.resolvedCumulativePosition,
            fundingTransitionBinding: fixture.fundingTransitionBinding,
            approvalAuthority: nestedApproval,
            operationReceipt: fixture.operationReceipt,
            postingIdentity: fixture.postingIdentity
          },
          refundPostingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "invalid_shape"
    );
    expect(moneyTraps).toBe(0);
  });

  it("posts approval only from exact payable-lot receipt effects", () => {
    const fixture = buildStandardRefundOperationFixture("refund_approved");
    const result = buildRefundApprovedPosting(
      {
        allocation: fixture.allocation,
        resolvedPriorAllocation: fixture.resolvedPriorAllocation,
        resolvedCumulativePosition: fixture.resolvedCumulativePosition,
        fundingTransitionBinding: fixture.fundingTransitionBinding,
        approvalAuthority: fixture.approvalAuthority,
        operationReceipt: fixture.operationReceipt,
        postingIdentity: fixture.postingIdentity
      },
      refundPostingDecoderEnvelope,
      receiptDecoderEnvelope
    );

    expect(result.kind).toBe("refund_journal");
    if (result.kind !== "refund_journal") throw new Error("expected refund journal");
    expect(result.operation).toBe("approved");
    expect(result.fundingDisposition).toBe("locked");
    expect(result.fundingTransitionBinding.transitions).toHaveLength(5);
    expect(
      result.fundingTransitionBinding.transitions.find(
        (row) => row.source.kind === "payable_root_lot"
      )?.components
    ).toHaveLength(2);
    expect(
      result.fundingTransitionBinding.transitions.every(
        (row) => row.transition === "free_to_reserved"
      )
    ).toBe(true);
    expect(result.cumulativePositionDecision.transition).toBe("unchanged");
    expect(result.recipe.transaction.entries).toEqual([
      expect.objectContaining({
        account: expect.objectContaining({ code: "astrologer_available" }),
        side: "debit",
        amount: { amountMinor: 1_500, currency: "RUB" }
      }),
      expect.objectContaining({
        account: expect.objectContaining({ code: "astrologer_reserved" }),
        side: "debit",
        amount: { amountMinor: 500, currency: "RUB" }
      }),
      expect.objectContaining({
        account: expect.objectContaining({ code: "astrologer_refund_pending" }),
        side: "credit",
        amount: { amountMinor: 1_500, currency: "RUB" }
      }),
      expect.objectContaining({
        account: expect.objectContaining({ code: "astrologer_refund_pending" }),
        side: "credit",
        amount: { amountMinor: 500, currency: "RUB" }
      })
    ]);
    expect(result.componentBindings).toHaveLength(4);
  });

  it("posts confirmed provider refund as A + D + I + K = R with composite evidence", () => {
    const fixture = buildStandardRefundOperationFixture("refund_confirmed");
    if (!fixture.terminalAuthority || !fixture.terminalEvidenceBinding) {
      throw new Error("missing confirmed refund evidence fixture");
    }
    const result = buildRefundConfirmedPosting(
      {
        allocation: fixture.allocation,
        resolvedPriorAllocation: fixture.resolvedPriorAllocation,
        resolvedCumulativePosition: fixture.resolvedCumulativePosition,
        fundingTransitionBinding: fixture.fundingTransitionBinding,
        terminalAuthority: fixture.terminalAuthority,
        terminalEvidenceBinding: fixture.terminalEvidenceBinding,
        operationReceipt: fixture.operationReceipt,
        originalPlatformJournals: fixture.originalPlatformJournals,
        postingIdentity: fixture.postingIdentity
      },
      refundPostingDecoderEnvelope,
      receiptDecoderEnvelope
    );

    expect(result.kind).toBe("refund_journal");
    if (result.kind !== "refund_journal") throw new Error("expected refund journal");
    expect(result.operation).toBe("confirmed");
    expect(result.fundingDisposition).toBe("consumed");
    expect(
      result.fundingTransitionBinding.transitions.every(
        (row) => row.transition === "reserved_to_consumed"
      )
    ).toBe(true);
    expect(result.cumulativePositionDecision.transition).toBe("advance");
    expect(result.recipe.transaction.totalDebitMinor).toBe("2500");
    expect(result.recipe.transaction.totalCreditMinor).toBe("2500");
    expect(result.recipe.transaction.entries.map((entry) => entry.account.code)).toEqual([
      "astrologer_refund_pending",
      "astrologer_refund_pending",
      "astrologer_recovery_receivable",
      "payout_inflight_refund_bridge",
      "platform_commission_deferred",
      "platform_commission_revenue",
      "arc_provider_clearing"
    ]);
    expect(result.terminalEvidenceBinding.operationReceiptRef).toEqual({
      kind: "payable_lot_operation_receipt",
      evidenceId: fixture.operationReceipt.receiptId,
      canonicalDigest: fixture.operationReceipt.canonicalDigest
    });
  });

  it("posts definitive failure only from receipt lineage and releases non-ledger funding", () => {
    const fixture = buildStandardRefundOperationFixture("refund_failed");
    if (!fixture.terminalAuthority || !fixture.terminalEvidenceBinding) {
      throw new Error("missing failed refund evidence fixture");
    }
    const result = buildRefundFailedPosting(
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

    expect(result.kind).toBe("refund_journal");
    if (result.kind !== "refund_journal") throw new Error("expected refund journal");
    expect(result.fundingDisposition).toBe("released");
    expect(
      result.fundingTransitionBinding.transitions.every(
        (row) => row.transition === "reserved_to_free"
      )
    ).toBe(true);
    expect(result.cumulativePositionDecision.transition).toBe("unchanged");
    expect(result.recipe.transaction.entries.map((entry) => entry.account.code)).toEqual([
      "astrologer_refund_pending",
      "astrologer_refund_pending",
      "astrologer_available",
      "astrologer_reserved"
    ]);
    expect(result.recipe.transaction.entries.map((entry) => entry.links.componentId)).toEqual([
      "component-a-1",
      "component-a-2",
      "component-a-1",
      "component-a-2"
    ]);
  });

  it("rejects a terminal composite that points at another receipt", () => {
    const fixture = buildStandardRefundOperationFixture("refund_confirmed");
    if (!fixture.terminalAuthority || !fixture.terminalEvidenceBinding) {
      throw new Error("missing confirmed refund evidence fixture");
    }
    const wrongReceipt = receiptFor("refund_failed");
    expectPostingReason(
      () =>
        buildRefundConfirmedPosting(
          {
            allocation: fixture.allocation,
            resolvedPriorAllocation: fixture.resolvedPriorAllocation,
            resolvedCumulativePosition: fixture.resolvedCumulativePosition,
            fundingTransitionBinding: fixture.fundingTransitionBinding,
            terminalAuthority: fixture.terminalAuthority,
            terminalEvidenceBinding: fixture.terminalEvidenceBinding,
            operationReceipt: wrongReceipt,
            originalPlatformJournals: fixture.originalPlatformJournals,
            postingIdentity: fixture.postingIdentity
          },
          refundPostingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "proof_operation_receipt_mismatch"
    );
  });

  it("rejects a re-signed receipt whose Task5 authority digest is detached", () => {
    const fixture = buildStandardRefundOperationFixture("refund_confirmed");
    if (!fixture.terminalAuthority || !fixture.terminalEvidenceBinding) {
      throw new Error("missing confirmed refund evidence fixture");
    }
    const receipt = structuredClone(fixture.operationReceipt) as Record<string, unknown>;
    const authorityRefs = receipt.authorityRefs as Record<string, unknown>[];
    const authorityRef = authorityRefs[0];
    if (!authorityRef) throw new Error("missing receipt authority fixture");
    authorityRef.canonicalDigest = hashFinanceCommandPayload({ detached: true });
    delete receipt.canonicalDigest;
    const detachedReceipt = { ...receipt, canonicalDigest: digestValue(receipt) };
    expectPostingReason(
      () =>
        buildRefundConfirmedPosting(
          {
            allocation: fixture.allocation,
            resolvedPriorAllocation: fixture.resolvedPriorAllocation,
            resolvedCumulativePosition: fixture.resolvedCumulativePosition,
            fundingTransitionBinding: fixture.fundingTransitionBinding,
            terminalAuthority: fixture.terminalAuthority,
            terminalEvidenceBinding: fixture.terminalEvidenceBinding,
            operationReceipt: detachedReceipt,
            originalPlatformJournals: fixture.originalPlatformJournals,
            postingIdentity: fixture.postingIdentity
          },
          refundPostingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "proof_operation_receipt_mismatch"
    );
  });

  it("fails before producing a recipe when the receipt envelope cannot cover its effects", () => {
    const fixture = buildStandardRefundOperationFixture("refund_approved");
    expectPostingReason(
      () =>
        buildRefundApprovedPosting(
          {
            allocation: fixture.allocation,
            resolvedPriorAllocation: fixture.resolvedPriorAllocation,
            resolvedCumulativePosition: fixture.resolvedCumulativePosition,
            fundingTransitionBinding: fixture.fundingTransitionBinding,
            approvalAuthority: fixture.approvalAuthority,
            operationReceipt: fixture.operationReceipt,
            postingIdentity: fixture.postingIdentity
          },
          refundPostingDecoderEnvelope,
          { ...receiptDecoderEnvelope, maxEffects: 1 }
        ),
      "proof_operation_receipt_mismatch"
    );
  });

  it("rejects a non-terminal provider status instead of producing a posting", () => {
    const fixture = buildStandardRefundOperationFixture("refund_confirmed");
    if (!fixture.terminalAuthority || !fixture.terminalEvidenceBinding) {
      throw new Error("missing confirmed refund evidence fixture");
    }
    const binding = structuredClone(fixture.terminalEvidenceBinding) as Record<string, unknown>;
    const providerIntent = binding.providerIntent as Record<string, unknown>;
    providerIntent.status = "processing";
    expectPostingReason(
      () =>
        buildRefundConfirmedPosting(
          {
            allocation: fixture.allocation,
            resolvedPriorAllocation: fixture.resolvedPriorAllocation,
            resolvedCumulativePosition: fixture.resolvedCumulativePosition,
            fundingTransitionBinding: fixture.fundingTransitionBinding,
            terminalAuthority: fixture.terminalAuthority,
            terminalEvidenceBinding: binding,
            operationReceipt: fixture.operationReceipt,
            originalPlatformJournals: fixture.originalPlatformJournals,
            postingIdentity: fixture.postingIdentity
          },
          refundPostingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "evidence_mismatch"
    );
  });
});

function expectPostingReason(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected finance posting error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}
