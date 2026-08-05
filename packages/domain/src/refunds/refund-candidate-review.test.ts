import { describe, expect, it } from "vitest";

import {
  RefundCandidateReviewError,
  createRefundCandidateReview
} from "./refund-candidate-review";
import type { RefundCandidate } from "./refund-candidate";

const candidate: RefundCandidate = {
  id: "11111111-1111-4111-8111-111111111111",
  orderId: "22222222-2222-4222-8222-222222222222",
  clientUserId: "33333333-3333-4333-8333-333333333333",
  statement: "Service was not provided as agreed.",
  status: "submitted",
  version: 1,
  submittedAt: "2026-08-05T12:00:00.000Z",
  resolvedRefundCaseId: null,
  resolvedAt: null,
  updatedAt: "2026-08-05T12:00:00.000Z"
};

describe("refund candidate internal review", () => {
  it("records an append-only claim and advances the candidate by its expected version only", () => {
    expect(
      createRefundCandidateReview({
        reviewId: "44444444-4444-4444-8444-444444444444",
        candidate,
        expectedVersion: 1,
        actorUserId: "55555555-5555-4555-8555-555555555555",
        action: "claimed",
        note: "  Investigating delivery history.  ",
        now: "2026-08-05T12:10:00.000Z"
      })
    ).toEqual({
      candidate: { ...candidate, status: "under_review", version: 2, updatedAt: "2026-08-05T12:10:00.000Z" },
      review: {
        id: "44444444-4444-4444-8444-444444444444",
        candidateId: candidate.id,
        candidateVersion: 2,
        actorUserId: "55555555-5555-4555-8555-555555555555",
        action: "claimed",
        note: "Investigating delivery history.",
        refundCaseId: null,
        reviewedAt: "2026-08-05T12:10:00.000Z"
      }
    });
  });

  it("permits a documented rejection but never records a monetary/provider outcome", () => {
    const underReview = { ...candidate, status: "under_review" as const, version: 2 };
    const result = createRefundCandidateReview({
      reviewId: "44444444-4444-4444-8444-444444444444",
      candidate: underReview,
      expectedVersion: 2,
      actorUserId: "55555555-5555-4555-8555-555555555555",
      action: "rejected",
      note: "The service was delivered and accepted in the conversation.",
      now: "2026-08-05T12:10:00.000Z"
    });
    expect(result.candidate).toMatchObject({ status: "rejected", version: 3 });
    expect(result.review).not.toHaveProperty("amountMinor");
    expect(result.review).not.toHaveProperty("providerRefundId");
  });

  it("rejects stale, terminal, or malformed reviews before persistence", () => {
    const input = {
      reviewId: "44444444-4444-4444-8444-444444444444",
      candidate,
      expectedVersion: 2,
      actorUserId: "55555555-5555-4555-8555-555555555555",
      action: "claimed" as const,
      note: "Investigating delivery history.",
      now: "2026-08-05T12:10:00.000Z"
    };
    expect(() => createRefundCandidateReview(input)).toThrow(RefundCandidateReviewError);
    expect(() =>
      createRefundCandidateReview({ ...input, expectedVersion: 1, candidate: { ...candidate, status: "rejected" } })
    ).toThrow(RefundCandidateReviewError);
    expect(() => createRefundCandidateReview({ ...input, expectedVersion: 1, note: "\n" })).toThrow(
      RefundCandidateReviewError
    );
  });
});
