import {
  clientReviewableInstanceListResponseSchema,
  clientReviewDetailSchema,
  reviewModerationCaseMessageCreateSchema,
  reviewModerationCaseDetailSchema,
  reviewModerationCaseMessageSchema,
  reviewVersionSubmissionSchema,
  type ClientReviewableInstanceListResponse,
  type ClientReviewDetail,
  type ReviewModerationCaseMessage,
  type ReviewModerationCaseMessageCreate,
  type ReviewModerationCaseDetail,
  type ReviewVersionSubmission
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listClientReviewableInstances(
  input: {
    readonly limit?: number;
    readonly cursor?: string | null;
  } = {}
): Promise<ClientReviewableInstanceListResponse> {
  const search = new URLSearchParams();
  if (input.limit !== undefined) search.set("limit", String(input.limit));
  if (input.cursor) search.set("cursor", input.cursor);
  const query = search.toString();
  return clientReviewableInstanceListResponseSchema.parse(
    await application.http.get(`/me/reviews/reviewable-instances${query ? `?${query}` : ""}`)
  );
}

export async function getClientReviewDetail(
  reviewableInstanceId: string
): Promise<ClientReviewDetail> {
  return clientReviewDetailSchema.parse(
    await application.http.get(`/me/reviews/reviewable-instances/${reviewableInstanceId}`)
  );
}

export async function submitClientReviewVersion(
  input: ReviewVersionSubmission,
  idempotencyKey: string
): Promise<ClientReviewDetail> {
  const request = reviewVersionSubmissionSchema.parse(input);
  return clientReviewDetailSchema.parse(
    await application.http.post("/me/reviews/versions", request, {
      csrf: true,
      idempotencyKey
    })
  );
}

export async function createClientReviewCaseMessage(
  caseId: string,
  input: ReviewModerationCaseMessageCreate,
  idempotencyKey: string
): Promise<ReviewModerationCaseMessage> {
  const request = reviewModerationCaseMessageCreateSchema.parse(input);
  return reviewModerationCaseMessageSchema.parse(
    await application.http.post(`/me/reviews/moderation-cases/${caseId}/messages`, request, {
      csrf: true,
      idempotencyKey
    })
  );
}

export async function getClientReviewModerationCaseDetail(
  caseId: string
): Promise<ReviewModerationCaseDetail> {
  return reviewModerationCaseDetailSchema.parse(
    await application.http.get(`/me/reviews/moderation-cases/${caseId}`)
  );
}
