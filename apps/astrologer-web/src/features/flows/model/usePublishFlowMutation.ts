import type { PublishFlowResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { publishFlowMutationOptions } from "./flowsQueryOptions";

export function usePublishFlowMutation(): UseMutationResult<
  PublishFlowResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();

  return useMutation(publishFlowMutationOptions(queryClient));
}
