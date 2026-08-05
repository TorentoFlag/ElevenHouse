import { describe, expect, it } from "vitest";

import {
  adminRefundCandidateReviewRequestSchema,
  adminRefundCandidateReviewResponseSchema
} from "./admin-refund-candidates";

describe("admin refund candidate contracts", () => {
  it("accepts a bounded expected-version review command only", () => {
    expect(
      adminRefundCandidateReviewRequestSchema.parse({
        expectedVersion: 2,
        action: "rejected",
        note: "  The agreed service was delivered.  "
      })
    ).toEqual({ expectedVersion: 2, action: "rejected", note: "The agreed service was delivered." });
    expect(() =>
      adminRefundCandidateReviewRequestSchema.parse({
        expectedVersion: 2,
        action: "refund_decision_recorded",
        note: "approved",
        amountMinor: 10_000
      })
    ).toThrow();
  });

  it("returns review state without claiming an ArcPay or ledger outcome", () => {
    const response = {
      candidate: {
        id: "11111111-1111-4111-8111-111111111111",
        orderId: "22222222-2222-4222-8222-222222222222",
        clientUserId: "33333333-3333-4333-8333-333333333333",
        statement: "Service was not delivered.",
        status: "under_review",
        version: 2,
        submittedAt: "2026-08-05T12:00:00.000Z",
        updatedAt: "2026-08-05T12:10:00.000Z"
      },
      review: {
        id: "44444444-4444-4444-8444-444444444444",
        candidateId: "11111111-1111-4111-8111-111111111111",
        candidateVersion: 2,
        actorUserId: "55555555-5555-4555-8555-555555555555",
        action: "claimed",
        note: "Investigating delivery history.",
        reviewedAt: "2026-08-05T12:10:00.000Z"
      }
    };
    expect(adminRefundCandidateReviewResponseSchema.parse(response)).toEqual(response);
    expect(() => adminRefundCandidateReviewResponseSchema.parse({ ...response, providerRefundId: "x" })).toThrow();
  });
});
