import { useMutation } from "@tanstack/react-query";
import {
  createHumanDesignCalculationMutationOptions,
  previewHumanDesignMutationOptions
} from "./humanDesignQueries";

export function usePreviewHumanDesignMutation() {
  return useMutation(previewHumanDesignMutationOptions());
}

export function useCreateHumanDesignCalculationMutation() {
  return useMutation(createHumanDesignCalculationMutationOptions());
}
