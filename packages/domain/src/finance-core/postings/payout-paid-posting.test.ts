import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { buildUnverifiedPayoutPaidPosting } from "./payout-paid-posting";
import { PayoutPostingContradictionError } from "./payout-posting-contradiction";
import {
  holdPayoutReceipt,
  holdPayoutTransitionCase,
  postingDecoderEnvelope,
  receiptDecoderEnvelope,
  receiptPostingInput
} from "./hold-payout-posting-test-fixtures";
import { payoutExposureBindingFixture } from "./payout-bank-exposure-test-fixtures";

describe("payout paid posting", () => {
  it("debits exact payout lots and adds one aggregate outbound-clearing credit", () => {
    const fixture = paidFixture();
    const recipe = buildUnverifiedPayoutPaidPosting(
      fixture.input,
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    expect(
      recipe.transaction.entries.map((entry) => [
        entry.account.code,
        entry.side,
        entry.amount.amountMinor,
        entry.links.payoutAllocationId
      ])
    ).toEqual([
      ["astrologer_payout_pending", "debit", 8_640, "receipt-payout-allocation-available"],
      ["astrologer_payout_pending", "debit", 360, "receipt-payout-allocation-reserve"],
      ["bank_outbound_clearing", "credit", 9_000, null]
    ]);
    expect(recipe.linkProof.edges.at(-1)).toMatchObject({
      semanticEdgeId: null,
      lotAllocationId: null,
      links: {
        originalSaleId: null,
        componentId: null,
        payableLotId: null,
        payoutAllocationId: null
      }
    });
    expect(recipe.linkProof.allocationAuthorityRef.kind).toBe("payout_paid_posting");
  });

  it("enforces maker-checker separation for final paid confirmation", () => {
    const fixture = paidFixture();
    expect(() =>
      buildUnverifiedPayoutPaidPosting(
        {
          ...fixture.input,
          authority: {
            ...fixture.input.authority,
            authorizationProof: {
              ...fixture.input.authority.authorizationProof,
              actorUserId: "finance-approver-1"
            }
          }
        },
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      )
    ).toThrowError(expect.objectContaining({ reason: "authority_mismatch" }));
  });

  it("rejects source-authority body drift under the receipt authority digest", () => {
    const fixture = paidFixture();
    expect(() =>
      buildUnverifiedPayoutPaidPosting(
        {
          ...fixture.input,
          authority: {
            ...fixture.input.authority,
            sourceAuthority: {
              ...fixture.input.authority.sourceAuthority,
              bankReference: "forged-bank-reference"
            }
          }
        },
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      )
    ).toThrowError(expect.objectContaining({ reason: "authority_mismatch" }));
  });

  it("quarantines paid after a definitive no-transfer outcome", () => {
    const fixture = paidFixture();
    const released = payoutExposureBindingFixture({
      previous: fixture.committed,
      transitionKind: "pre_transfer_released",
      exposureVersion: "2",
      status: "released",
      occurredAt: "2026-09-04T01:30:00Z",
      overrides: fixture.scope
    });
    expect(() =>
      buildUnverifiedPayoutPaidPosting(
        {
          ...fixture.input,
          authority: {
            ...fixture.input.authority,
            payoutState: {
              expectedVersion: "5",
              from: "failed",
              nextVersion: "6",
              to: "paid"
            }
          },
          previousExposureBinding: released
        },
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      )
    ).toThrowError(
      expect.objectContaining<Partial<PayoutPostingContradictionError>>({
        reason: "paid_after_definitive_no_transfer"
      })
    );
  });
});

function paidFixture() {
  const receipt = holdPayoutReceipt("payout_paid");
  const sourceAuthority =
    holdPayoutTransitionCase("payout_paid").transition.historyRecord.authority;
  if (sourceAuthority?.kind !== "payout_paid") throw new Error("missing paid authority");
  const scope = {
    payoutRequestId: sourceAuthority.payoutRequestId,
    amount: { amountMinor: 9_000, currency: "RUB" },
    beneficiarySnapshot: {
      snapshotId: "payout-beneficiary-snapshot-1",
      schemaVersion: 1,
      fingerprint: "beneficiary-fingerprint-1",
      canonicalDigest: `sha256:${"b".repeat(64)}`
    }
  } as const;
  const committed = payoutExposureBindingFixture({ overrides: scope });
  const initiated = payoutExposureBindingFixture({
    previous: committed,
    transitionKind: "bank_work_initiated",
    exposureVersion: "2",
    status: "initiated_unreflected",
    occurredAt: "2026-09-04T01:30:00Z",
    overrides: scope
  });
  const paid = payoutExposureBindingFixture({
    previous: initiated,
    transitionKind: "paid_proven",
    exposureVersion: "3",
    status: "paid_unreflected",
    occurredAt: sourceAuthority.transferredAt,
    overrides: {
      ...scope,
      transitionAuthorityRef: {
        kind: sourceAuthority.kind,
        authorityId: sourceAuthority.authorityId,
        version: sourceAuthority.version,
        canonicalDigest: receipt.authorityRefs[0]?.canonicalDigest
      }
    }
  });
  const base = receiptPostingInput(receipt);
  const commandCore = {
    kind: "payout_paid_posting" as const,
    sourceAuthority,
    receiptBinding: base.receiptBinding,
    payoutState: {
      expectedVersion: "5",
      from: "processing_manual" as const,
      nextVersion: "6",
      to: "paid" as const
    }
  };
  const payloadHash = hashFinanceCommandPayload(commandCore);
  const authority = {
    ...commandCore,
    exposureTransition: paid,
    authorizationProof: {
      authorizationId: "payout-paid-authorization-1",
      actorUserId: "finance-confirmer-1",
      sessionId: "payout-paid-session-1",
      actionKind: "payout_confirm_paid" as const,
      aggregateId: sourceAuthority.payoutRequestId,
      expectedVersion: 5,
      payloadHash,
      verifiedAt: "2026-09-04T01:45:00Z",
      expiresAt: "2026-09-04T03:00:00Z",
      status: "consumed" as const
    }
  };
  return {
    committed,
    scope,
    input: { ...base, authority, previousExposureBinding: initiated }
  };
}
