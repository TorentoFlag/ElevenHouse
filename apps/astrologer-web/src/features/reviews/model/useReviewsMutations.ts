import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createAstrologerReviewCaseMessageMutationOptions,
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

export function useCreateAstrologerReviewCaseMessageMutation() {
  return useMutation(createAstrologerReviewCaseMessageMutationOptions(useQueryClient()));
}
