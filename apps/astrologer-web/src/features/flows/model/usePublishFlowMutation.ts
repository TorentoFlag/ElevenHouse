import type { PublishFlowDefinitionResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { PublishFlowInput } from "../api/publishFlow";
import { publishFlowMutationOptions } from "./flowsQueryOptions";

export function usePublishFlowMutation(): UseMutationResult<
  PublishFlowDefinitionResponse,
  Error,
  PublishFlowInput
> {
  const queryClient = useQueryClient();

  return useMutation(publishFlowMutationOptions(queryClient));
}
