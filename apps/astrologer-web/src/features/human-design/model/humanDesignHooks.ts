import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHumanDesignCalculationMutationOptions,
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
