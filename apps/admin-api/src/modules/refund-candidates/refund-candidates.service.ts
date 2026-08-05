import { HttpException, Inject, Injectable } from "@nestjs/common";
import {
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  RefundCandidateNotFoundError,
  RefundCandidateReviewError,
  reviewRefundCandidate,
  type RefundCandidateReviewReceipt,
  type RefundCandidateStore
} from "@elevenhouse/domain";
import {
  adminRefundCandidateReviewRequestSchema,
  adminRefundCandidateParamsSchema,
  adminRefundCandidateListQuerySchema,
  adminRefundCandidateListResponseSchema,
  type AdminRefundCandidateListResponse,
  adminRefundCandidateReviewResponseSchema,
  type AdminRefundCandidateReviewResponse
} from "@elevenhouse/contracts";

import { SystemClock } from "../../common/system-clock.js";
import { ADMIN_REFUND_CANDIDATE_STORE } from "./refund-candidates.tokens";

@Injectable()
export class AdminRefundCandidatesService {
  constructor(
    @Inject(ADMIN_REFUND_CANDIDATE_STORE)
    private readonly candidateStore: Pick<
      RefundCandidateStore,
      "executeReviewCandidate" | "listForAdmin"
    >,
    @Inject(SystemClock)
    private readonly clock: SystemClock
  ) {}

  async review(
    adminUserId: string,
    candidateId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<AdminRefundCandidateReviewResponse> {
    return mapReviewErrors(async () => {
      const params = adminRefundCandidateParamsSchema.safeParse({ candidateId });
      const request = adminRefundCandidateReviewRequestSchema.safeParse(body);
      if (!params.success || !request.success) {
        throw reviewHttpError(400, "invalid_request", "Invalid refund candidate review request");
      }
      const receipt = await reviewRefundCandidate({
        candidateStore: this.candidateStore,
        candidateId: params.data.candidateId,
        expectedVersion: request.data.expectedVersion,
        actorUserId: adminUserId,
        action: request.data.action,
        note: request.data.note,
        idempotencyKey,
        now: this.clock.now()
      });
      return adminRefundCandidateReviewResponseSchema.parse(toResponse(receipt));
    });
  }

  async list(query: unknown): Promise<AdminRefundCandidateListResponse> {
    const parsed = adminRefundCandidateListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw reviewHttpError(400, "invalid_request", "Invalid refund candidate list query");
    }
    const candidates = await this.candidateStore.listForAdmin({
      statuses: parsed.data.status ? [parsed.data.status] : undefined,
      limit: parsed.data.limit
    });
    return adminRefundCandidateListResponseSchema.parse({
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        orderId: candidate.orderId,
        clientUserId: candidate.clientUserId,
        statement: candidate.statement,
        status: candidate.status,
        version: candidate.version,
        submittedAt: candidate.submittedAt,
        updatedAt: candidate.updatedAt
      }))
    });
  }
}

function toResponse(receipt: RefundCandidateReviewReceipt): AdminRefundCandidateReviewResponse {
  return {
    candidate: {
      id: receipt.candidate.id,
      orderId: receipt.candidate.orderId,
      clientUserId: receipt.candidate.clientUserId,
      statement: receipt.candidate.statement,
      status: receipt.candidate.status,
      version: receipt.candidate.version,
      submittedAt: receipt.candidate.submittedAt,
      updatedAt: receipt.candidate.updatedAt
    },
    review: {
      id: receipt.review.id,
      candidateId: receipt.review.candidateId,
      candidateVersion: receipt.review.candidateVersion,
      actorUserId: receipt.review.actorUserId,
      action: receipt.review.action,
      note: receipt.review.note,
      reviewedAt: receipt.review.reviewedAt
    }
  };
}

async function mapReviewErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    if (error instanceof RefundCandidateNotFoundError) {
      throw reviewHttpError(404, error.code, "Refund candidate was not found");
    }
    if (
      error instanceof RefundCandidateReviewError ||
      error instanceof FinanceIdempotencyConflictError ||
      error instanceof FinanceIdempotencyInProgressError ||
      error instanceof FinanceIdempotencyFailedError
    ) {
      throw reviewHttpError(409, error.code, error.message);
    }
    throw error;
  }
}

function reviewHttpError(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message }, status);
}
