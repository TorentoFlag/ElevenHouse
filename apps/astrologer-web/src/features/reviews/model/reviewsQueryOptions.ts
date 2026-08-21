import type {
  CreateReviewReplyAiDraftResponse,
  ReviewAstrologerListResponse,
  ReviewModerationCaseDetail,
  ReviewModerationCaseMessage,
  ReviewReplyVersion
} from "@elevenhouse/contracts";
import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import {
  createAstrologerReviewCaseMessage,
  createReviewReplyAiDraft,
  getAstrologerReviewModerationCaseDetail,
  listAstrologerReviews,
  openReviewDispute,
  submitReviewReplyVersion,
  type CreateAstrologerReviewCaseMessageInput,
  type CreateReviewReplyAiDraftInput,
  type ListAstrologerReviewsInput,
  type OpenReviewDisputeInput,
  type SubmitReviewReplyVersionInput
} from "../api/reviewsApi";

export const reviewsQueryKeys = {
  all: () => ["reviews"] as const,
  astrologerList: (input: ListAstrologerReviewsInput) =>
    ["reviews", "astrologer-list", input] as const,
  moderationCase: (caseId: string) => ["reviews", "moderation-case", caseId] as const
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

export function astrologerReviewModerationCaseQueryOptions(caseId: string) {
  return {
    queryKey: reviewsQueryKeys.moderationCase(caseId),
    queryFn: (): Promise<ReviewModerationCaseDetail> =>
      getAstrologerReviewModerationCaseDetail(caseId)
  };
}

export function createAstrologerReviewCaseMessageMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (
      input: CreateAstrologerReviewCaseMessageInput
    ): Promise<ReviewModerationCaseMessage> => createAstrologerReviewCaseMessage(input),
    onSuccess: async (
      _message: ReviewModerationCaseMessage,
      input: CreateAstrologerReviewCaseMessageInput
    ) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reviewsQueryKeys.all() }),
        queryClient.invalidateQueries({ queryKey: reviewsQueryKeys.moderationCase(input.caseId) })
      ]);
    }
  };
}

function invalidateAstrologerReviews(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return queryClient.invalidateQueries({ queryKey: reviewsQueryKeys.all() });
}
