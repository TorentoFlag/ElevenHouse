import {
  createReviewReplyAiDraftRequestSchema,
  createReviewReplyAiDraftResponseSchema,
  paidOrderFulfillmentReviewReceiptRequestSchema,
  reviewAstrologerListQuerySchema,
  reviewAstrologerListResponseSchema,
  reviewModerationCaseDetailSchema,
  reviewModerationDecisionSchema,
  reviewModerationCaseMessageCreateSchema,
  reviewModerationCaseMessageSchema,
  reviewRequestCreateSchema,
  reviewRequestDeliveryResponseSchema,
  reviewRequestTargetListQuerySchema,
  reviewRequestTargetListResponseSchema,
  reviewReplySubmissionSchema,
  reviewReplyVersionSchema,
  reviewSourceReceiptResponseSchema,
  type CreateReviewReplyAiDraftRequest,
  type CreateReviewReplyAiDraftResponse,
  type PaidOrderFulfillmentReviewReceiptRequest,
  type ReviewAstrologerListResponse,
  type ReviewModerationCaseDetail,
  type ReviewModerationDecision,
  type ReviewModerationCaseMessage,
  type ReviewModerationCaseMessageCreate,
  type ReviewRequestCreate,
  type ReviewRequestDeliveryResponse,
  type ReviewRequestTargetListResponse,
  type ReviewReplySubmission,
  type ReviewReplyVersion,
  type ReviewSourceReceiptResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

const astrologerReviewsClientQuerySchema = reviewAstrologerListQuerySchema.omit({
  astrologerUserId: true
});

export type ListAstrologerReviewsInput = Readonly<{
  limit?: number;
  cursor?: string | null;
}>;

export async function listAstrologerReviews(
  input: ListAstrologerReviewsInput
): Promise<ReviewAstrologerListResponse> {
  const query = astrologerReviewsClientQuerySchema.parse(input);
  const searchParams = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) searchParams.set("cursor", query.cursor);

  return reviewAstrologerListResponseSchema.parse(
    await application.http.get(`/reviews?${searchParams.toString()}`)
  );
}

const reviewRequestTargetsClientQuerySchema = reviewRequestTargetListQuerySchema.omit({
  astrologerUserId: true
});

export type ListReviewRequestTargetsInput = Readonly<{
  limit?: number;
  cursor?: string | null;
}>;

export async function listReviewRequestTargets(
  input: ListReviewRequestTargetsInput
): Promise<ReviewRequestTargetListResponse> {
  const query = reviewRequestTargetsClientQuerySchema.parse(input);
  const searchParams = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) searchParams.set("cursor", query.cursor);

  return reviewRequestTargetListResponseSchema.parse(
    await application.http.get(`/reviews/request-targets?${searchParams.toString()}`)
  );
}

export type CreateReviewReplyAiDraftInput = Readonly<{
  reviewId: string;
  idempotencyKey: string;
  body: CreateReviewReplyAiDraftRequest;
}>;

export async function createReviewReplyAiDraft(
  input: CreateReviewReplyAiDraftInput
): Promise<CreateReviewReplyAiDraftResponse> {
  const body = createReviewReplyAiDraftRequestSchema.parse(input.body);

  return createReviewReplyAiDraftResponseSchema.parse(
    await application.http.post(
      `/reviews/${encodeURIComponent(input.reviewId)}/reply-drafts/ai`,
      body,
      commandRequestOptions(input.idempotencyKey)
    )
  );
}

export type RequestReviewInput = Readonly<{
  idempotencyKey: string;
  body: ReviewRequestCreate;
}>;

export async function requestReview(
  input: RequestReviewInput
): Promise<ReviewRequestDeliveryResponse> {
  const body = reviewRequestCreateSchema.parse(input.body);

  return reviewRequestDeliveryResponseSchema.parse(
    await application.http.post(
      "/reviews/request-review",
      body,
      commandRequestOptions(input.idempotencyKey)
    )
  );
}

export type RecordPaidOrderFulfillmentReviewReceiptInput = Readonly<{
  idempotencyKey: string;
  body: PaidOrderFulfillmentReviewReceiptRequest;
}>;

export async function recordPaidOrderFulfillmentReviewReceipt(
  input: RecordPaidOrderFulfillmentReviewReceiptInput
): Promise<ReviewSourceReceiptResponse> {
  const body = paidOrderFulfillmentReviewReceiptRequestSchema.parse(input.body);

  return reviewSourceReceiptResponseSchema.parse(
    await application.http.post(
      "/reviews/source-receipts/paid-order-fulfillment",
      body,
      commandRequestOptions(input.idempotencyKey)
    )
  );
}

export type SubmitReviewReplyVersionInput = Readonly<{
  reviewId: string;
  idempotencyKey: string;
  body: ReviewReplySubmission;
}>;

export async function submitReviewReplyVersion(
  input: SubmitReviewReplyVersionInput
): Promise<ReviewReplyVersion> {
  const body = reviewReplySubmissionSchema.parse(input.body);

  return reviewReplyVersionSchema.parse(
    await application.http.post(
      `/reviews/${encodeURIComponent(input.reviewId)}/reply-versions`,
      body,
      commandRequestOptions(input.idempotencyKey)
    )
  );
}

export type OpenReviewDisputeInput = Readonly<{
  reviewId: string;
  idempotencyKey: string;
  body: ReviewModerationDecision;
}>;

export async function openReviewDispute(
  input: OpenReviewDisputeInput
): Promise<ReviewModerationCaseDetail> {
  const body = reviewModerationDecisionSchema.parse(input.body);

  return reviewModerationCaseDetailSchema.parse(
    await application.http.post(
      `/reviews/${encodeURIComponent(input.reviewId)}/disputes`,
      body,
      commandRequestOptions(input.idempotencyKey)
    )
  );
}

export async function getAstrologerReviewModerationCaseDetail(
  caseId: string
): Promise<ReviewModerationCaseDetail> {
  return reviewModerationCaseDetailSchema.parse(
    await application.http.get(`/reviews/moderation-cases/${encodeURIComponent(caseId)}`)
  );
}

export type CreateAstrologerReviewCaseMessageInput = Readonly<{
  caseId: string;
  idempotencyKey: string;
  body: ReviewModerationCaseMessageCreate;
}>;

export async function createAstrologerReviewCaseMessage(
  input: CreateAstrologerReviewCaseMessageInput
): Promise<ReviewModerationCaseMessage> {
  const body = reviewModerationCaseMessageCreateSchema.parse(input.body);

  return reviewModerationCaseMessageSchema.parse(
    await application.http.post(
      `/reviews/moderation-cases/${encodeURIComponent(input.caseId)}/messages`,
      body,
      commandRequestOptions(input.idempotencyKey)
    )
  );
}

function commandRequestOptions(idempotencyKey: string) {
  return {
    csrf: true,
    headers: { "idempotency-key": idempotencyKey }
  } as const;
}
