import {
  createReviewReplyAiDraftRequestSchema,
  createReviewReplyAiDraftResponseSchema,
  reviewAstrologerListQuerySchema,
  reviewAstrologerListResponseSchema,
  reviewModerationCaseDetailSchema,
  reviewModerationDecisionSchema,
  reviewReplySubmissionSchema,
  reviewReplyVersionSchema,
  type CreateReviewReplyAiDraftRequest,
  type CreateReviewReplyAiDraftResponse,
  type ReviewAstrologerListResponse,
  type ReviewModerationCaseDetail,
  type ReviewModerationDecision,
  type ReviewReplySubmission,
  type ReviewReplyVersion
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

function commandRequestOptions(idempotencyKey: string) {
  return {
    csrf: true,
    headers: { "idempotency-key": idempotencyKey }
  } as const;
}
