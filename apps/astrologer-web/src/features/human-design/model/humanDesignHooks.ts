import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveHumanDesignInterpretationMutationOptions,
  createHumanDesignAiDraftMutationOptions,
  createHumanDesignCalculationMutationOptions,
  downloadHumanDesignPdfMutationOptions,
  enqueueHumanDesignPdfMutationOptions,
  getHumanDesignTransitMutationOptions,
  humanDesignCalculationListQueryOptions,
  humanDesignPdfQueryOptions,
  previewHumanDesignMutationOptions,
  recalculateHumanDesignCalculationMutationOptions,
  saveHumanDesignInterpretationMutationOptions
} from "./humanDesignQueries";
import type { CalculationPdfLocale } from "@elevenhouse/contracts";

export function useHumanDesignCalculationListQuery() {
  return useQuery(humanDesignCalculationListQueryOptions());
}

export function useHumanDesignPdfQuery(input: {
  readonly calculationId: string;
  readonly locale: CalculationPdfLocale;
  readonly resultChecksum: string;
}) {
  return useQuery(humanDesignPdfQueryOptions(input));
}

export function usePreviewHumanDesignMutation() {
  return useMutation(previewHumanDesignMutationOptions());
}

export function useCreateHumanDesignCalculationMutation() {
  return useMutation(createHumanDesignCalculationMutationOptions(useQueryClient()));
}

export function useRecalculateHumanDesignCalculationMutation() {
  return useMutation(recalculateHumanDesignCalculationMutationOptions(useQueryClient()));
}

export function useGetHumanDesignTransitMutation() {
  return useMutation(getHumanDesignTransitMutationOptions());
}

export function useCreateHumanDesignAiDraftMutation() {
  return useMutation(createHumanDesignAiDraftMutationOptions(useQueryClient()));
}

export function useSaveHumanDesignInterpretationMutation() {
  return useMutation(saveHumanDesignInterpretationMutationOptions(useQueryClient()));
}

export function useApproveHumanDesignInterpretationMutation() {
  return useMutation(approveHumanDesignInterpretationMutationOptions(useQueryClient()));
}

export function useEnqueueHumanDesignPdfMutation() {
  return useMutation(enqueueHumanDesignPdfMutationOptions(useQueryClient()));
}

export function useDownloadHumanDesignPdfMutation() {
  return useMutation(downloadHumanDesignPdfMutationOptions());
}
