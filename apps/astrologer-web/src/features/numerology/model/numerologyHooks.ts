import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveCalculationInterpretationMutationOptions,
  archiveNumerologyMutationOptions,
  createNumerologyAiDraftMutationOptions,
  createNumerologyMutationOptions,
  previewNumerologyMutationOptions,
  linkCalculationClientMutationOptions,
  numerologyCalculationListQueryOptions,
  publishCalculationMutationOptions,
  recalculateNumerologyMutationOptions,
  saveCalculationInterpretationMutationOptions
} from "./numerologyQueries";

export function useNumerologyCalculationListQuery() {
  return useQuery(numerologyCalculationListQueryOptions());
}

export function useCreateNumerologyMutation() {
  const queryClient = useQueryClient();

  return useMutation(createNumerologyMutationOptions(queryClient));
}

export function usePreviewNumerologyMutation() {
  return useMutation(previewNumerologyMutationOptions());
}

export function useCreateNumerologyAiDraftMutation() {
  const queryClient = useQueryClient();

  return useMutation(createNumerologyAiDraftMutationOptions(queryClient));
}

export function useRecalculateNumerologyMutation() {
  const queryClient = useQueryClient();

  return useMutation(recalculateNumerologyMutationOptions(queryClient));
}

export function useLinkCalculationClientMutation() {
  const queryClient = useQueryClient();

  return useMutation(linkCalculationClientMutationOptions(queryClient));
}

export function useSaveCalculationInterpretationMutation() {
  const queryClient = useQueryClient();

  return useMutation(saveCalculationInterpretationMutationOptions(queryClient));
}

export function useApproveCalculationInterpretationMutation() {
  const queryClient = useQueryClient();

  return useMutation(approveCalculationInterpretationMutationOptions(queryClient));
}

export function usePublishCalculationMutation() {
  const queryClient = useQueryClient();

  return useMutation(publishCalculationMutationOptions(queryClient));
}

export function useArchiveNumerologyMutation() {
  const queryClient = useQueryClient();

  return useMutation(archiveNumerologyMutationOptions(queryClient));
}
