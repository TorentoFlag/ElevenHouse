import type { FlowDefinitionV2 } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { CreateNextFlowDraftInput } from "../api/createNextFlowDraft";
import { createNextFlowDraftMutationOptions } from "./flowsQueryOptions";

export function useCreateNextFlowDraftMutation(): UseMutationResult<
  FlowDefinitionV2,
  Error,
  CreateNextFlowDraftInput
> {
  const queryClient = useQueryClient();

  return useMutation(createNextFlowDraftMutationOptions(queryClient));
}
