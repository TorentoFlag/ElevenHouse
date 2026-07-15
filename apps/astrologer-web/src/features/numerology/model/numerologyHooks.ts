import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveCalculationInterpretationMutationOptions,
  archiveNumerologyMutationOptions,
  createNumerologyAiDraftMutationOptions,
  createNumerologyMutationOptions,
  downloadNumerologyPdfMutationOptions,
  enqueueNumerologyPdfMutationOptions,
  previewNumerologyMutationOptions,
  linkCalculationClientMutationOptions,
  numerologyCalculationListQueryOptions,
  numerologyPdfQueryOptions,
  publishCalculationMutationOptions,
  recalculateNumerologyMutationOptions,
  saveCalculationInterpretationMutationOptions
} from "./numerologyQueries";
import type { CalculationPdfLocale } from "@elevenhouse/contracts";

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

export function useNumerologyPdfQuery(input: {
  readonly calculationId: string;
  readonly locale: CalculationPdfLocale;
  readonly resultChecksum: string;
}) {
  return useQuery(numerologyPdfQueryOptions(input));
}

export function useEnqueueNumerologyPdfMutation() {
  const queryClient = useQueryClient();

  return useMutation(enqueueNumerologyPdfMutationOptions(queryClient));
}

export function useDownloadNumerologyPdfMutation() {
  return useMutation(downloadNumerologyPdfMutationOptions());
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
