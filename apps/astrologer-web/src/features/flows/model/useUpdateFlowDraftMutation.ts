import type { FlowDefinitionV2 } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { UpdateFlowDraftInput } from "../api/updateFlowDraft";
import { updateFlowDraftMutationOptions } from "./flowsQueryOptions";

export function useUpdateFlowDraftMutation(): UseMutationResult<
  FlowDefinitionV2,
  Error,
  UpdateFlowDraftInput
> {
  const queryClient = useQueryClient();

  return useMutation(updateFlowDraftMutationOptions(queryClient));
}
