import type { ManualFlowRunResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { type CreateManualFlowRunInput } from "../api/createManualFlowRun";
import { createManualFlowRunMutationOptions } from "./flowsQueryOptions";

export function useCreateManualFlowRunMutation(): UseMutationResult<
  ManualFlowRunResponse,
  Error,
  CreateManualFlowRunInput
> {
  const queryClient = useQueryClient();

  return useMutation(createManualFlowRunMutationOptions(queryClient));
}
