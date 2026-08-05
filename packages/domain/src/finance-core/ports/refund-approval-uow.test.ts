import { describe, expect, it } from "vitest";

import {
  deriveRefundProviderDispatchAuthorization,
  type VerifiedRefundApprovalAuthority
} from "../index";

describe("refund approval provider authorization", () => {
  it("derives the provider authorization only from the verified approval authority", () => {
    const authority = {
      kind: "verified_refund_approval_authority",
      refundId: "refund-1",
      refundVersion: 4,
      orderId: "order-1",
      economicPaymentIntentId: "payment-intent-1",
      previousCumulativeRefundedMinor: "1200",
      approvedCumulativeRefundedMinor: "2500",
      allocationAuthorityId: "allocation-1",
      allocationAuthorityVersion: "3",
      allocationAuthorityDigest: `sha256:${"a".repeat(64)}`,
      approvalAuthorityId: "approval-1",
      approvalAuthorityVersion: "7",
      approvalAuthorityDigest: `sha256:${"b".repeat(64)}`,
      approvedByActorId: "admin-1",
      approvedAt: "2026-08-05T12:00:00.000Z"
    } as VerifiedRefundApprovalAuthority;

    expect(deriveRefundProviderDispatchAuthorization(authority)).toEqual({
      kind: "refund_authorization",
      authorityId: "approval-1",
      authorityVersion: "7",
      authorityDigest: `sha256:${"b".repeat(64)}`,
      sourceId: "order-1",
      refundId: "refund-1",
      refundVersion: 4,
      approvedCumulativeAmountMinor: "2500"
    });
  });
});
