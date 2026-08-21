import type {
  CreateReviewReplyAiDraftResponse,
  ReviewAstrologerListResponse,
  ReviewModerationCaseDetail,
  ReviewModerationCaseMessage,
  ReviewRequestDeliveryResponse,
  ReviewRequestTargetListResponse,
  ReviewReplyVersion
} from "@elevenhouse/contracts";
import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import {
  createAstrologerReviewCaseMessage,
  createReviewReplyAiDraft,
  getAstrologerReviewModerationCaseDetail,
  listAstrologerReviews,
  listReviewRequestTargets,
  openReviewDispute,
  requestReview,
  submitReviewReplyVersion,
  type CreateAstrologerReviewCaseMessageInput,
  type CreateReviewReplyAiDraftInput,
  type ListAstrologerReviewsInput,
  type ListReviewRequestTargetsInput,
  type OpenReviewDisputeInput,
  type RequestReviewInput,
  type SubmitReviewReplyVersionInput
} from "../api/reviewsApi";

export const reviewsQueryKeys = {
  all: () => ["reviews"] as const,
  astrologerList: (input: ListAstrologerReviewsInput) =>
    ["reviews", "astrologer-list", input] as const,
  requestTargets: (input: ListReviewRequestTargetsInput) =>
    ["reviews", "request-targets", input] as const,
  moderationCase: (caseId: string) => ["reviews", "moderation-case", caseId] as const
};

export function astrologerReviewsListQueryOptions(input: ListAstrologerReviewsInput) {
  return {
    queryKey: reviewsQueryKeys.astrologerList(input),
    queryFn: (): Promise<ReviewAstrologerListResponse> => listAstrologerReviews(input),
    placeholderData: keepPreviousData
  };
}

export function reviewRequestTargetsQueryOptions(input: ListReviewRequestTargetsInput) {
  return {
    queryKey: reviewsQueryKeys.requestTargets(input),
    queryFn: (): Promise<ReviewRequestTargetListResponse> => listReviewRequestTargets(input),
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

export function requestReviewMutationOptions(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return {
    mutationFn: (input: RequestReviewInput): Promise<ReviewRequestDeliveryResponse> =>
      requestReview(input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: reviewsQueryKeys.requestTargets({ limit: 50, cursor: null })
      })
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
