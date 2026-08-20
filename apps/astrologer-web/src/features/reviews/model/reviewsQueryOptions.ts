import type {
  CreateReviewReplyAiDraftResponse,
  ReviewAstrologerListResponse,
  ReviewModerationCaseDetail,
  ReviewReplyVersion
} from "@elevenhouse/contracts";
import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import {
  createReviewReplyAiDraft,
  listAstrologerReviews,
  openReviewDispute,
  submitReviewReplyVersion,
  type CreateReviewReplyAiDraftInput,
  type ListAstrologerReviewsInput,
  type OpenReviewDisputeInput,
  type SubmitReviewReplyVersionInput
} from "../api/reviewsApi";

export const reviewsQueryKeys = {
  all: () => ["reviews"] as const,
  astrologerList: (input: ListAstrologerReviewsInput) =>
    ["reviews", "astrologer-list", input] as const
};

export function astrologerReviewsListQueryOptions(input: ListAstrologerReviewsInput) {
  return {
    queryKey: reviewsQueryKeys.astrologerList(input),
    queryFn: (): Promise<ReviewAstrologerListResponse> => listAstrologerReviews(input),
    placeholderData: keepPreviousData
  };
}

export function submitReviewReplyVersionMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: SubmitReviewReplyVersionInput): Promise<ReviewReplyVersion> =>
      submitReviewReplyVersion(input),
    onSuccess: () => invalidateAstrologerReviews(queryClient)
  };
}

export function createReviewReplyAiDraftMutationOptions() {
  return {
    mutationFn: (input: CreateReviewReplyAiDraftInput): Promise<CreateReviewReplyAiDraftResponse> =>
      createReviewReplyAiDraft(input)
  };
}

export function openReviewDisputeMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: OpenReviewDisputeInput): Promise<ReviewModerationCaseDetail> =>
      openReviewDispute(input),
    onSuccess: () => invalidateAstrologerReviews(queryClient)
  };
}

function invalidateAstrologerReviews(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return queryClient.invalidateQueries({ queryKey: reviewsQueryKeys.all() });
}
