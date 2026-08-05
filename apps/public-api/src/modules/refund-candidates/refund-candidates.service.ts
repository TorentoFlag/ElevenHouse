import { HttpException, Inject, Injectable } from "@nestjs/common";
import {
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  RefundCandidateAlreadyOpenError,
  RefundCandidateError,
  RefundCandidateOrderUnavailableError,
  listClientRefundCandidates,
  submitClientRefundCandidate,
  type FinanceOrderStore,
  type RefundCandidate,
  type RefundCandidateStore
} from "@elevenhouse/domain";
import {
  clientRefundCandidateResponseSchema,
  refundCandidateOrderParamsSchema,
  submitClientRefundCandidateRequestSchema,
  type ClientRefundCandidateResponse
} from "@elevenhouse/contracts";

import { SystemClock } from "../../common/system-clock.js";
import { REFUND_CANDIDATES_ORDER_STORE, REFUND_CANDIDATES_STORE } from "./refund-candidates.tokens";

@Injectable()
export class RefundCandidatesService {
  constructor(
    @Inject(REFUND_CANDIDATES_ORDER_STORE)
    private readonly orderStore: Pick<FinanceOrderStore, "findById">,
    @Inject(REFUND_CANDIDATES_STORE)
    private readonly candidateStore: Pick<
      RefundCandidateStore,
      "executeSubmitCandidate" | "listByOrderAndClient"
    >,
    @Inject(SystemClock)
    private readonly clock: SystemClock
  ) {}

  async submit(
    clientUserId: string,
    orderId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<ClientRefundCandidateResponse> {
    return mapRefundCandidateErrors(async () => {
      const params = refundCandidateOrderParamsSchema.safeParse({ orderId });
      const request = submitClientRefundCandidateRequestSchema.safeParse(body);
      if (!params.success || !request.success) {
        throw refundCandidateHttpError(400, "invalid_request", "Invalid refund candidate request");
      }
      const candidate = await submitClientRefundCandidate({
        orderStore: this.orderStore,
        candidateStore: this.candidateStore,
        clientUserId,
        orderId: params.data.orderId,
        statement: request.data.statement,
        idempotencyKey,
        now: this.clock.now()
      });
      return clientRefundCandidateResponseSchema.parse(toClientResponse(candidate));
    });
  }

  async list(clientUserId: string, orderId: string): Promise<readonly ClientRefundCandidateResponse[]> {
    return mapRefundCandidateErrors(async () => {
      const params = refundCandidateOrderParamsSchema.safeParse({ orderId });
      if (!params.success) {
        throw refundCandidateHttpError(400, "invalid_request", "Invalid refund candidate order");
      }
      const candidates = await listClientRefundCandidates({
        orderStore: this.orderStore,
        candidateStore: this.candidateStore,
        clientUserId,
        orderId: params.data.orderId
      });
      return candidates.map((candidate) =>
        clientRefundCandidateResponseSchema.parse(toClientResponse(candidate))
      );
    });
  }
}

function toClientResponse(candidate: RefundCandidate): ClientRefundCandidateResponse {
  return {
    id: candidate.id,
    orderId: candidate.orderId,
    clientUserId: candidate.clientUserId,
    statement: candidate.statement,
    status: candidate.status,
    submittedAt: candidate.submittedAt,
    updatedAt: candidate.updatedAt
  };
}

async function mapRefundCandidateErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    if (error instanceof RefundCandidateOrderUnavailableError) {
      throw refundCandidateHttpError(404, error.code, "Order was not found");
    }
    if (error instanceof RefundCandidateAlreadyOpenError) {
      throw refundCandidateHttpError(409, error.code, error.message);
    }
    if (
      error instanceof FinanceIdempotencyConflictError ||
      error instanceof FinanceIdempotencyInProgressError ||
      error instanceof FinanceIdempotencyFailedError ||
      error instanceof RefundCandidateError
    ) {
      throw refundCandidateHttpError(409, error.code, error.message);
    }
    throw error;
  }
}

function refundCandidateHttpError(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message }, status);
}
