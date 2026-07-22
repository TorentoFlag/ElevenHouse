import { useMutation } from "@tanstack/react-query";
import { previewHumanDesignMutationOptions } from "./humanDesignQueries";

export function usePreviewHumanDesignMutation() {
  return useMutation(previewHumanDesignMutationOptions());
}
