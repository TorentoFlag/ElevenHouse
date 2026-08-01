import type { CreateFlowRequest, FlowResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { createFlowMutationOptions } from "./flowsQueryOptions";

export function useCreateFlowMutation(): UseMutationResult<
  FlowResponse,
  Error,
  CreateFlowRequest
> {
  const queryClient = useQueryClient();

  return useMutation(createFlowMutationOptions(queryClient));
}
