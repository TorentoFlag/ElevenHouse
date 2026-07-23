import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHumanDesignAiDraftMutationOptions,
  createHumanDesignCalculationMutationOptions,
  getHumanDesignTransitMutationOptions,
  humanDesignCalculationListQueryOptions,
  previewHumanDesignMutationOptions,
  recalculateHumanDesignCalculationMutationOptions
} from "./humanDesignQueries";

export function useHumanDesignCalculationListQuery() {
  return useQuery(humanDesignCalculationListQueryOptions());
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
