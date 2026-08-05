import { describe, expect, it } from "vitest";
import { receiptDecoderEnvelope } from "./payable-lot-posting-link-test-fixtures";
import { FinancePostingIntegrityError } from "./posting-codec";
import {
  buildRefundApprovedPosting,
  buildRefundBridgePayoutFailedPosting,
  buildRefundBridgePayoutPaidPosting,
  buildRefundConfirmedPosting,
  buildRefundFailedPosting
} from "./refund-postings";
import {
  buildBridgeFailedFixture,
  buildZeroPayableRefundFixture
} from "./refund-posting-bridge-test-fixtures";
import { buildBridgePaidFixture } from "./refund-posting-bridge-paid-test-fixture";
import { refundPostingDecoderEnvelope } from "./refund-posting-test-fixtures";

describe("zero-payable and payout-bridge refund postings", () => {
  it("rejects hostile bridge authorities and source keys before invoking their traps", () => {
    const failed = buildBridgeFailedFixture();
    let failedAuthorityTraps = 0;
    const hostileFailedAuthority = new Proxy(failed.bridgeAuthority, {
      getPrototypeOf() {
        failedAuthorityTraps += 1;
        throw new Error("must not execute");
      },
      ownKeys() {
        failedAuthorityTraps += 1;
        throw new Error("must not execute");
      }
    });
    expectPostingReason(
      () =>
        buildRefundBridgePayoutFailedPosting(
          { ...failed, bridgeAuthority: hostileFailedAuthority },
          refundPostingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "invalid_shape"
    );
    expect(failedAuthorityTraps).toBe(0);

    let failedAmountTraps = 0;
    const failedAmount = new Proxy(failed.bridgeAuthority.amount, {
      getPrototypeOf() {
        failedAmountTraps += 1;
        throw new Error("must not execute");
      },
      ownKeys() {
        failedAmountTraps += 1;
        throw new Error("must not execute");
      }
    });
    expectPostingReason(
      () =>
        buildRefundBridgePayoutFailedPosting(
          {
            ...failed,
            bridgeAuthority: { ...failed.bridgeAuthority, amount: failedAmount }
          },
          refundPostingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "invalid_shape"
    );
    expect(failedAmountTraps).toBe(0);

    const paid = buildBridgePaidFixture();
    let paidAuthorityTraps = 0;
    const hostilePaidAuthority = new Proxy(paid.modelDecision.authority, {
      getPrototypeOf() {
        paidAuthorityTraps += 1;
        throw new Error("must not execute");
      },
      ownKeys() {
        paidAuthorityTraps += 1;
        throw new Error("must not execute");
      }
    });
    expectPostingReason(
      () =>
        buildRefundBridgePayoutPaidPosting(
          {
            ...paid,
            modelDecision: { ...paid.modelDecision, authority: hostilePaidAuthority }
          },
          refundPostingDecoderEnvelope
        ),
      "invalid_shape"
    );
    expect(paidAuthorityTraps).toBe(0);

    let sourceKeyTraps = 0;
    const hostileSourceKey = new Proxy(paid.modelDecision.sourceKey, {
      getPrototypeOf() {
        sourceKeyTraps += 1;
        throw new Error("must not execute");
      },
      ownKeys() {
        sourceKeyTraps += 1;
        throw new Error("must not execute");
      }
    });
    expectPostingReason(
      () =>
        buildRefundBridgePayoutPaidPosting(
          {
            ...paid,
            modelDecision: { ...paid.modelDecision, sourceKey: hostileSourceKey }
          },
          refundPostingDecoderEnvelope
        ),
      "invalid_shape"
    );
    expect(sourceKeyTraps).toBe(0);
  });

  it("uses a local state-only decision for A=0 approval", () => {
    const fixture = buildZeroPayableRefundFixture("approved");
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
    expect(result).toMatchObject({
      kind: "refund_state_only",
      operation: "approved",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified",
      reason: "no_payable_lot_reclassification",
      fundingDisposition: "locked",
      componentBindings: []
    });
    expect(result.fundingTransitionBinding.transitions).toHaveLength(3);
  });

  it("rejects an A=0 state-only identity posted before the receipt", () => {
    const fixture = buildZeroPayableRefundFixture("approved");
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
            postingIdentity: {
              ...fixture.postingIdentity,
              postedAt: "2026-08-03T11:59:59Z"
            }
          },
          refundPostingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "invalid_chronology"
    );
  });

  it("still posts D + I + K = R for A=0 confirmed", () => {
    const fixture = buildZeroPayableRefundFixture("confirmed");
    if (!fixture.terminalAuthority || !fixture.terminalEvidenceBinding) {
      throw new Error("missing zero-payable confirmed fixture");
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
    expect(result.recipe.transaction.totalDebitMinor).toBe("1000");
    expect(result.recipe.transaction.entries.map((entry) => entry.account.code)).toEqual([
      "astrologer_recovery_receivable",
      "payout_inflight_refund_bridge",
      "platform_commission_deferred",
      "arc_provider_clearing"
    ]);
  });

  it("uses a local state-only decision for A=0 definitive failure", () => {
    const fixture = buildZeroPayableRefundFixture("failed");
    if (!fixture.terminalAuthority || !fixture.terminalEvidenceBinding) {
      throw new Error("missing zero-payable failed fixture");
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
    expect(result).toMatchObject({
      kind: "refund_state_only",
      operation: "failed",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified",
      fundingDisposition: "released",
      componentBindings: []
    });
  });

  it("closes a definitively failed in-flight payout bridge from its exact receipt lot", () => {
    const fixture = buildBridgeFailedFixture();
    const result = buildRefundBridgePayoutFailedPosting(
      fixture,
      refundPostingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    expect(result.recipe.transaction.entries.map((entry) => entry.account.code)).toEqual([
      "astrologer_payout_pending",
      "payout_inflight_refund_bridge"
    ]);
    expect(result.recipe.transaction.entries.map((entry) => entry.amount.amountMinor)).toEqual([
      400, 400
    ]);
    expect(result.componentBindings).toHaveLength(1);
  });

  it("models a proven-paid bridge with null snapshot and explicit fail-closed status", () => {
    const fixture = buildBridgePaidFixture();
    const result = buildRefundBridgePayoutPaidPosting(fixture, refundPostingDecoderEnvelope);
    expect(result).toMatchObject({
      kind: "refund_journal",
      operation: "bridge_payout_paid",
      productionStatus: "model_only",
      returnResolutionStatus: "undefined_fail_closed"
    });
    expect("recipe" in result).toBe(false);
    expect(result.modelOnlyArtifact).toMatchObject({
      kind: "non_committable_refund_bridge_paid_model",
      commitEligibility: "blocked_missing_return_resolution"
    });
    expect(result.modelOnlyArtifact.recipe.linkProof.operationSnapshotRef).toBeNull();
    expect(
      result.modelOnlyArtifact.recipe.transaction.entries.map((entry) => entry.account.code)
    ).toEqual(["platform_refund_loss", "payout_inflight_refund_bridge"]);
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
