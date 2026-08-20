import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createReviewReplyAiDraftMutationOptions,
  openReviewDisputeMutationOptions,
  submitReviewReplyVersionMutationOptions
} from "./reviewsQueryOptions";

export function useSubmitReviewReplyVersionMutation() {
  return useMutation(submitReviewReplyVersionMutationOptions(useQueryClient()));
}

export function useCreateReviewReplyAiDraftMutation() {
  return useMutation(createReviewReplyAiDraftMutationOptions());
}

export function useOpenReviewDisputeMutation() {
  return useMutation(openReviewDisputeMutationOptions(useQueryClient()));
}
