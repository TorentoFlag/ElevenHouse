import type { RefundCandidate } from "./refund-candidate";

export type RefundCandidateReviewAction = "claimed" | "rejected";

export type RefundCandidateReview = Readonly<{
  id: string;
  candidateId: string;
  candidateVersion: number;
  actorUserId: string;
  action: RefundCandidateReviewAction;
  note: string;
  refundCaseId: null;
  reviewedAt: string;
}>;

export class RefundCandidateReviewError extends Error {
  readonly code = "refund_candidate_review_invalid" as const;

  constructor(
    readonly reason:
      | "invalid_input"
      | "version_conflict"
      | "candidate_not_reviewable"
      | "invalid_transition"
      | "note_invalid"
  ) {
    super("Refund candidate review could not be recorded");
    this.name = "RefundCandidateReviewError";
  }
}

/**
 * A review documents internal handling only. The deliberately absent `refund_decision_recorded`
 * action belongs to the separate step-up-authorized issuer, never to a queue review.
 */
export function createRefundCandidateReview(input: {
  readonly reviewId: string;
  readonly candidate: RefundCandidate;
  readonly expectedVersion: number;
  readonly actorUserId: string;
  readonly action: RefundCandidateReviewAction;
  readonly note: string;
  readonly now: string;
}): Readonly<{ candidate: RefundCandidate; review: RefundCandidateReview }> {
  const reviewId = uuid(input.reviewId);
  const actorUserId = uuid(input.actorUserId);
  const now = instant(input.now);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) fail("invalid_input");
  if (!input.candidate || input.candidate.version !== input.expectedVersion) fail("version_conflict");
  if (input.candidate.status === "rejected" || input.candidate.status === "resolved") {
    fail("candidate_not_reviewable");
  }
  const action = actionValue(input.action);
  if (action === "claimed" && input.candidate.status !== "submitted") fail("invalid_transition");
  const note = normalizeNote(input.note);
  const candidateVersion = input.expectedVersion + 1;
  const status = action === "claimed" ? "under_review" : "rejected";
  const candidate = Object.freeze({
    ...input.candidate,
    status,
    version: candidateVersion,
    updatedAt: now
  }) as RefundCandidate;
  const review = Object.freeze({
    id: reviewId,
    candidateId: input.candidate.id,
    candidateVersion,
    actorUserId,
    action,
    note,
    refundCaseId: null,
    reviewedAt: now
  });
  return Object.freeze({ candidate, review });
}

function actionValue(value: unknown): RefundCandidateReviewAction {
  if (value === "claimed" || value === "rejected") return value;
  fail("invalid_input");
}

function normalizeNote(value: unknown): string {
  if (typeof value !== "string") fail("note_invalid");
  const normalized = value.trim();
  if (!normalized || normalized.length > 2_000 || hasAsciiControlCharacter(normalized)) {
    fail("note_invalid");
  }
  return normalized;
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value
    )
  ) {
    fail("invalid_input");
  }
  return value;
}

function instant(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value) ||
    Number.isNaN(new Date(value).getTime())
  ) {
    fail("invalid_input");
  }
  return value;
}

function hasAsciiControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

function fail(reason: RefundCandidateReviewError["reason"]): never {
  throw new RefundCandidateReviewError(reason);
}
