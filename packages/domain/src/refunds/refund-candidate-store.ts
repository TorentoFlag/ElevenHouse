import type {
  FinanceIdempotentCommand,
  FinanceIdempotentCommandResult
} from "../finance/shared/idempotent-command";
import type {
  ClientRefundCandidate,
  RefundCandidate,
  RefundCandidateStatus
} from "./refund-candidate";
import type {
  RefundCandidateReview,
  RefundCandidateReviewAction
} from "./refund-candidate-review";

export class RefundCandidateAlreadyOpenError extends Error {
  readonly code = "refund_candidate_already_open";

  constructor() {
    super("An open refund candidate already exists for this order");
    this.name = "RefundCandidateAlreadyOpenError";
  }
}

export class RefundCandidateNotFoundError extends Error {
  readonly code = "refund_candidate_not_found";

  constructor() {
    super("Refund candidate was not found");
    this.name = "RefundCandidateNotFoundError";
  }
}

export type ReviewRefundCandidateInput = Readonly<{
  reviewId: string;
  candidateId: string;
  expectedVersion: number;
  actorUserId: string;
  action: RefundCandidateReviewAction;
  note: string;
  now: string;
}>;

export type RefundCandidateReviewReceipt = Readonly<{
  candidate: RefundCandidate;
  review: RefundCandidateReview;
}>;

/** Persistence boundary for a client dispute; this is intentionally not a refund authority. */
export type RefundCandidateStore = {
  readonly executeSubmitCandidate: (
    command: FinanceIdempotentCommand,
    create: () => Promise<ClientRefundCandidate>
  ) => Promise<FinanceIdempotentCommandResult<RefundCandidate>>;
  readonly listByOrderAndClient: (input: {
    readonly orderId: string;
    readonly clientUserId: string;
  }) => Promise<readonly RefundCandidate[]>;
  readonly listForAdmin: (input: {
    readonly statuses?: readonly RefundCandidateStatus[];
    readonly limit: number;
  }) => Promise<readonly RefundCandidate[]>;
  readonly executeReviewCandidate: (
    command: FinanceIdempotentCommand,
    input: ReviewRefundCandidateInput
  ) => Promise<FinanceIdempotentCommandResult<RefundCandidateReviewReceipt>>;
};
