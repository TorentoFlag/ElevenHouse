import { describe, expect, it } from "vitest";
import {
  buildUnverifiedPayoutNoTransferReleasePosting,
  buildUnverifiedPayoutRequestPosting
} from "./payout-request-release-posting";
import {
  holdPayoutReceipt,
  holdPayoutTransitionCase,
  postingDecoderEnvelope,
  receiptDecoderEnvelope,
  receiptPostingInput
} from "./hold-payout-posting-test-fixtures";
import {
  payoutExposureBindingFixture,
  rehashPayoutExposureBinding
} from "./payout-bank-exposure-test-fixtures";

describe("payout request and no-transfer release postings", () => {
  it("moves multiple exact available lots to payout pending without structural remainder turnover", () => {
    const recipe = buildUnverifiedPayoutRequestPosting(
      receiptPostingInput(holdPayoutReceipt("payout_requested")),
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    expect(recipe.transaction.entries.map(row)).toEqual([
      ["astrologer_available", "debit", 8_640, "receipt-payout-allocation-available"],
      ["astrologer_available", "debit", 360, "receipt-payout-allocation-reserve"],
      ["astrologer_payout_pending", "credit", 8_640, "receipt-payout-allocation-available"],
      ["astrologer_payout_pending", "credit", 360, "receipt-payout-allocation-reserve"]
    ]);
    expect(recipe.transaction.entries.some((entry) => entry.amount.amountMinor === 600)).toBe(
      false
    );
  });

  it("releases exact payout lots and closes a committed exposure", () => {
    const receipt = holdPayoutReceipt("payout_released");
    const sourceAuthority =
      holdPayoutTransitionCase("payout_released").transition.historyRecord.authority;
    if (sourceAuthority?.kind !== "payout_no_transfer_outcome") {
      throw new Error("missing payout release authority");
    }
    const committed = payoutExposureBindingFixture({
      overrides: {
        payoutRequestId: sourceAuthority.payoutRequestId,
        amount: { amountMinor: 9_000, currency: "RUB" }
      }
    });
    const released = payoutExposureBindingFixture({
      previous: committed,
      transitionKind: "pre_transfer_released",
      exposureVersion: "2",
      status: "released",
      occurredAt: sourceAuthority.decidedAt,
      overrides: {
        amount: { amountMinor: 9_000, currency: "RUB" },
        payoutRequestId: sourceAuthority.payoutRequestId,
        transitionAuthorityRef: {
          kind: sourceAuthority.kind,
          authorityId: sourceAuthority.authorityId,
          version: sourceAuthority.version,
          canonicalDigest: receipt.authorityRefs[0]?.canonicalDigest
        }
      }
    });
    const authority = {
      kind: "payout_no_transfer_release_posting",
      sourceAuthority,
      receiptBinding: receiptPostingInput(receipt).receiptBinding,
      payoutState: {
        expectedVersion: "3",
        from: "approved",
        nextVersion: "4",
        to: "failed"
      },
      exposureTransition: released,
      bridgeClosures: []
    } as const;
    const base = receiptPostingInput(receipt);
    const recipe = buildUnverifiedPayoutNoTransferReleasePosting(
      { ...base, authority, previousExposureBinding: committed },
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    expect(recipe.transaction.entries.map(row)).toEqual([
      ["astrologer_payout_pending", "debit", 8_640, "receipt-payout-allocation-available"],
      ["astrologer_payout_pending", "debit", 360, "receipt-payout-allocation-reserve"],
      ["astrologer_available", "credit", 8_640, "receipt-payout-allocation-available"],
      ["astrologer_available", "credit", 360, "receipt-payout-allocation-reserve"]
    ]);
  });

  it("releases a pre-approval request without inventing a bank exposure", () => {
    const receipt = holdPayoutReceipt("payout_released");
    const sourceAuthority =
      holdPayoutTransitionCase("payout_released").transition.historyRecord.authority;
    if (sourceAuthority?.kind !== "payout_no_transfer_outcome") throw new Error("fixture");
    const base = receiptPostingInput(receipt);
    const authority = {
      kind: "payout_no_transfer_release_posting" as const,
      sourceAuthority,
      receiptBinding: base.receiptBinding,
      payoutState: {
        expectedVersion: "2",
        from: "under_review" as const,
        nextVersion: "3",
        to: "failed" as const
      },
      exposureTransition: null,
      bridgeClosures: []
    };
    expect(() =>
      buildUnverifiedPayoutNoTransferReleasePosting(
        { ...base, authority, previousExposureBinding: null },
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      )
    ).not.toThrow();
    expect(() =>
      buildUnverifiedPayoutNoTransferReleasePosting(
        {
          ...base,
          authority: {
            ...authority,
            payoutState: { ...authority.payoutState, from: "approved" }
          },
          previousExposureBinding: null
        },
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      )
    ).toThrowError(expect.objectContaining({ reason: "authority_mismatch" }));
  });

  it("rejects incomplete exposure coverage and stale exposure versions", () => {
    const receipt = holdPayoutReceipt("payout_released");
    const sourceAuthority =
      holdPayoutTransitionCase("payout_released").transition.historyRecord.authority;
    if (sourceAuthority?.kind !== "payout_no_transfer_outcome") throw new Error("fixture");
    const committed = payoutExposureBindingFixture({
      overrides: { payoutRequestId: sourceAuthority.payoutRequestId }
    });
    const release = payoutExposureBindingFixture({
      previous: committed,
      transitionKind: "pre_transfer_released",
      exposureVersion: "2",
      status: "released",
      occurredAt: sourceAuthority.decidedAt,
      overrides: {
        payoutRequestId: sourceAuthority.payoutRequestId,
        transitionAuthorityRef: {
          kind: sourceAuthority.kind,
          authorityId: sourceAuthority.authorityId,
          version: sourceAuthority.version,
          canonicalDigest: receipt.authorityRefs[0]?.canonicalDigest
        }
      }
    });
    const base = receiptPostingInput(receipt);
    const authority = {
      kind: "payout_no_transfer_release_posting",
      sourceAuthority,
      receiptBinding: base.receiptBinding,
      payoutState: { expectedVersion: "3", from: "approved", nextVersion: "4", to: "failed" },
      exposureTransition: release,
      bridgeClosures: []
    };
    expect(() =>
      buildUnverifiedPayoutNoTransferReleasePosting(
        { ...base, authority, previousExposureBinding: committed },
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      )
    ).toThrowError(expect.objectContaining({ reason: "amount_mismatch" }));
    const stale = rehashPayoutExposureBinding({ ...release, exposureVersion: "3" });
    expect(() =>
      buildUnverifiedPayoutNoTransferReleasePosting(
        {
          ...base,
          authority: { ...authority, exposureTransition: stale },
          previousExposureBinding: committed
        },
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      )
    ).toThrowError(expect.objectContaining({ reason: "authority_mismatch" }));
  });

  it("closes an exposure only when receipt and distinct refund-bridge closures cover it exactly", () => {
    const receipt = holdPayoutReceipt("payout_released");
    const sourceAuthority =
      holdPayoutTransitionCase("payout_released").transition.historyRecord.authority;
    const receiptAuthorityRef = receipt.authorityRefs[0];
    if (
      sourceAuthority?.kind !== "payout_no_transfer_outcome" ||
      !receiptAuthorityRef ||
      !("authorityId" in receiptAuthorityRef)
    ) {
      throw new Error("fixture");
    }
    const scope = {
      payoutRequestId: sourceAuthority.payoutRequestId,
      amount: { amountMinor: 9_400, currency: "RUB" }
    } as const;
    const committed = payoutExposureBindingFixture({ overrides: scope });
    const sourceRef = {
      kind: sourceAuthority.kind,
      authorityId: sourceAuthority.authorityId,
      version: sourceAuthority.version,
      canonicalDigest: receiptAuthorityRef.canonicalDigest
    } as const;
    const released = payoutExposureBindingFixture({
      previous: committed,
      transitionKind: "pre_transfer_released",
      exposureVersion: "2",
      status: "released",
      occurredAt: sourceAuthority.decidedAt,
      overrides: { ...scope, transitionAuthorityRef: sourceRef }
    });
    const base = receiptPostingInput(receipt);
    const closure = {
      bridgeAllocationId: "refund-bridge-allocation-1",
      operationReceiptId: "refund-bridge-release-receipt-1",
      operationReceiptDigest: `sha256:${"a".repeat(64)}`,
      journalTransactionId: "refund-bridge-release-journal-1",
      journalTransactionDigest: `sha256:${"b".repeat(64)}`,
      amount: { amountMinor: 400, currency: "RUB" },
      payoutOutcomeAuthorityRef: sourceRef
    } as const;
    const authority = {
      kind: "payout_no_transfer_release_posting" as const,
      sourceAuthority,
      receiptBinding: base.receiptBinding,
      payoutState: {
        expectedVersion: "3",
        from: "approved" as const,
        nextVersion: "4",
        to: "failed" as const
      },
      exposureTransition: released,
      bridgeClosures: [closure]
    };
    const recipe = buildUnverifiedPayoutNoTransferReleasePosting(
      { ...base, authority, previousExposureBinding: committed },
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    expect(recipe.linkProof.allocationAuthorityRef.kind).toBe("payout_no_transfer_release_posting");
    expect(() =>
      buildUnverifiedPayoutNoTransferReleasePosting(
        {
          ...base,
          authority: { ...authority, bridgeClosures: [closure, closure] },
          previousExposureBinding: committed
        },
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      )
    ).toThrowError(expect.objectContaining({ reason: "authority_mismatch" }));
  });
});

function row(entry: {
  account: { code: string };
  side: string;
  amount: { amountMinor: number };
  links: { payoutAllocationId: string | null };
}) {
  return [entry.account.code, entry.side, entry.amount.amountMinor, entry.links.payoutAllocationId];
}
