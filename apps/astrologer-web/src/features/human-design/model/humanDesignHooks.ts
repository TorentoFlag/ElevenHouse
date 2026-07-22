import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHumanDesignCalculationMutationOptions,
  humanDesignCalculationListQueryOptions,
  previewHumanDesignMutationOptions
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
