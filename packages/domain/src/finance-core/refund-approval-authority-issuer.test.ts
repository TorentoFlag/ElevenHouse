import { describe, expect, it } from "vitest";

import { hashFinanceCommandPayload } from "../finance-authorization/canonical-command-payload";
import {
  RefundApprovalAuthorityIssuanceError,
  issueVerifiedRefundApprovalAuthority
} from "./refund-approval-authority-issuer";

const candidateId = "11111111-1111-4111-8111-111111111111";
const candidateReviewId = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";

describe("issueVerifiedRefundApprovalAuthority", () => {
  it("issues the only branded refund approval authority from a consumed, exact step-up proof", () => {
    const result = issueVerifiedRefundApprovalAuthority(input());

    expect(result).toMatchObject({
      kind: "verified_refund_approval_authority",
      refundId: "refund-1",
      refundVersion: 1,
      orderId: "order-1",
      economicPaymentIntentId: "payment-intent-1",
      previousCumulativeRefundedMinor: "400",
      approvedCumulativeRefundedMinor: "1000",
      approvedByActorId: actorUserId,
      approvalAuthorityId: "refund-approval-1"
    });
    expect(result.approvalAuthorityDigest).toBe(
      hashFinanceCommandPayload({
        kind: "refund_approval_authority.v1",
        refundId: "refund-1",
        refundVersion: 1,
        orderId: "order-1",
        economicPaymentIntentId: "payment-intent-1",
        previousCumulativeRefundedMinor: "400",
        approvedCumulativeRefundedMinor: "1000",
        allocationAuthorityId: "refund-allocation-1",
        allocationAuthorityVersion: "1",
        approvedByActorId: actorUserId,
        approvedAt: "2026-08-05T12:00:00Z"
      })
    );
  });

  it("rejects any stale or mismatched authorization proof", () => {
    expect(() =>
      issueVerifiedRefundApprovalAuthority({
        ...input(),
        authorization: { ...input().authorization, expectedVersion: 2 }
      })
    ).toThrow(RefundApprovalAuthorityIssuanceError);
    expect(() =>
      issueVerifiedRefundApprovalAuthority({
        ...input(),
        authorization: {
          ...input().authorization,
          payloadHash: hashFinanceCommandPayload({ candidateId, candidateReviewId, candidateVersion: 9, refundAmountMinor: "600", currency: "RUB" })
        }
      })
    ).toThrow(RefundApprovalAuthorityIssuanceError);
  });
});

function input() {
  const payload = { candidateId, candidateReviewId, candidateVersion: 3, refundAmountMinor: "600", currency: "RUB" } as const;
  return {
    authorization: {
      authorizationId: "44444444-4444-4444-8444-444444444444",
      actorUserId,
      sessionId: "55555555-5555-4555-8555-555555555555",
      actionKind: "refund_execute" as const,
      aggregateId: candidateId,
      expectedVersion: 3,
      payloadHash: hashFinanceCommandPayload(payload),
      verifiedAt: "2026-08-05T11:59:00Z",
      expiresAt: "2026-08-05T12:04:00Z",
      status: "consumed" as const
    },
    candidateId,
    candidateReviewId,
    candidateVersion: 3,
    refundId: "refund-1",
    refundVersion: 1,
    orderId: "order-1",
    economicPaymentIntentId: "payment-intent-1",
    previousCumulativeRefundedMinor: "400",
    approvedCumulativeRefundedMinor: "1000",
    allocationAuthorityId: "refund-allocation-1",
    allocationAuthorityVersion: "1",
    allocationAuthorityDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    approvalAuthorityId: "refund-approval-1",
    approvedAt: "2026-08-05T12:00:00Z"
  };
}
