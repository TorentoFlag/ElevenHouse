import { describe, expect, it, vi } from "vitest";

import { reviewRefundCandidate } from "./refund-candidate-review-use-case";
import type { RefundCandidateStore } from "./refund-candidate-store";

const candidateId = "11111111-1111-4111-8111-111111111111";
const actorUserId = "22222222-2222-4222-8222-222222222222";
const reviewId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-08-05T12:10:00.000Z");

describe("reviewRefundCandidate", () => {
  it("submits an admin-scoped idempotent review command without a money or provider input", async () => {
    const store = {
      executeReviewCandidate: vi.fn(async (_command, input) => ({
        kind: "created" as const,
        value: {
          candidate: {
            id: candidateId, orderId: "44444444-4444-4444-8444-444444444444", clientUserId: "55555555-5555-4555-8555-555555555555", statement: "Not delivered", status: "under_review" as const, version: 2, submittedAt: now.toISOString(), resolvedRefundCaseId: null, resolvedAt: null, updatedAt: now.toISOString()
          },
          review: { ...input, candidateVersion: 2, refundCaseId: null, reviewedAt: now.toISOString() }
        }
      }))
    } satisfies Pick<RefundCandidateStore, "executeReviewCandidate">;

    await reviewRefundCandidate({
      candidateStore: store,
      candidateId,
      expectedVersion: 1,
      actorUserId,
      action: "claimed",
      note: "Investigating delivery history.",
      idempotencyKey: "candidate-review-1",
      now,
      reviewIdGenerator: () => reviewId
    });

    expect(store.executeReviewCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: `admin.refund-candidates.review:${actorUserId}`,
        actorUserId,
        idempotencyKey: "candidate-review-1",
        requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
      }),
      expect.objectContaining({ reviewId, candidateId, expectedVersion: 1, action: "claimed" })
    );
  });
});
