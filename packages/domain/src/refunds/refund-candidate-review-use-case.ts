import { createHash, randomUUID } from "node:crypto";

import type { RefundCandidateReviewAction } from "./refund-candidate-review";
import type {
  RefundCandidateReviewReceipt,
  RefundCandidateStore
} from "./refund-candidate-store";

const reviewScopePrefix = "admin.refund-candidates.review";
const reviewIdempotencyTtlMs = 24 * 60 * 60 * 1_000;

export type ReviewRefundCandidateUseCaseInput = Readonly<{
  candidateStore: Pick<RefundCandidateStore, "executeReviewCandidate">;
  candidateId: string;
  expectedVersion: number;
  actorUserId: string;
  action: RefundCandidateReviewAction;
  note: string;
  idempotencyKey: string;
  now: Date;
  reviewIdGenerator?: () => string;
}>;

/** Creates an internal review receipt. It neither creates a refund case nor dispatches ArcPay. */
export async function reviewRefundCandidate(
  input: ReviewRefundCandidateUseCaseInput
): Promise<RefundCandidateReviewReceipt> {
  const now = input.now.toISOString();
  const result = await input.candidateStore.executeReviewCandidate(
    {
      scope: `${reviewScopePrefix}:${input.actorUserId}`,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.actorUserId,
      requestHash: hashReviewRequest(input),
      now,
      expiresAt: new Date(input.now.getTime() + reviewIdempotencyTtlMs).toISOString()
    },
    {
      reviewId: (input.reviewIdGenerator ?? randomUUID)(),
      candidateId: input.candidateId,
      expectedVersion: input.expectedVersion,
      actorUserId: input.actorUserId,
      action: input.action,
      note: input.note,
      now
    }
  );
  return result.value;
}

function hashReviewRequest(input: ReviewRefundCandidateUseCaseInput): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        candidateId: input.candidateId,
        expectedVersion: input.expectedVersion,
        actorUserId: input.actorUserId,
        action: input.action,
        note: input.note
      })
    )
    .digest("hex")}`;
}
