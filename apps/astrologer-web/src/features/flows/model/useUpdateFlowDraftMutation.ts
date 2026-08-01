import type { FlowResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { UpdateFlowDraftInput } from "../api/updateFlowDraft";
import { updateFlowDraftMutationOptions } from "./flowsQueryOptions";

export function useUpdateFlowDraftMutation(): UseMutationResult<
  FlowResponse,
  Error,
  UpdateFlowDraftInput
> {
  const queryClient = useQueryClient();

  return useMutation(updateFlowDraftMutationOptions(queryClient));
}
