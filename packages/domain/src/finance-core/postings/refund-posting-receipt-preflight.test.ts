import { describe, expect, it } from "vitest";
import { FinancePostingIntegrityError } from "./posting-codec";
import { receiptDecoderEnvelope } from "./payable-lot-posting-link-test-fixtures";
import { buildRefundApprovedPosting } from "./refund-postings";
import { buildStandardRefundOperationFixture } from "./refund-posting-builder-test-fixtures";
import { refundPostingDecoderEnvelope } from "./refund-posting-test-fixtures";

describe("refund posting receipt structural preflight", () => {
  it("enforces allocation caps before touching the receipt graph", () => {
    const fixture = buildStandardRefundOperationFixture("refund_approved");
    let receiptTouches = 0;
    const hostileReceipt = new Proxy(fixture.operationReceipt, {
      get(target, property, receiver) {
        receiptTouches += 1;
        return Reflect.get(target, property, receiver);
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
            approvalAuthority: fixture.approvalAuthority,
            operationReceipt: hostileReceipt,
            postingIdentity: fixture.postingIdentity
          },
          { ...refundPostingDecoderEnvelope, maxAllocations: 1 },
          receiptDecoderEnvelope
        ),
      "decoder_envelope_exceeded"
    );
    expect(receiptTouches).toBe(0);
  });

  it("rejects nested receipt proxies before invoking their traps", () => {
    const fixture = buildStandardRefundOperationFixture("refund_approved");
    const receipt = structuredClone(fixture.operationReceipt) as Record<string, unknown>;
    const effects = receipt.effects as Record<string, unknown>[];
    const effect = effects[0];
    if (!effect) throw new Error("missing receipt effect fixture");
    let traps = 0;
    effect.knownLinks = new Proxy(effect.knownLinks as object, {
      ownKeys() {
        traps += 1;
        return [];
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
            approvalAuthority: fixture.approvalAuthority,
            operationReceipt: receipt,
            postingIdentity: fixture.postingIdentity
          },
          refundPostingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "proof_operation_receipt_mismatch"
    );
    expect(traps).toBe(0);
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
