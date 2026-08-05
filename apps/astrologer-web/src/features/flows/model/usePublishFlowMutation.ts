import type { PublishFlowDefinitionV3Response } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { PublishFlowInput } from "../api/publishFlow";
import { publishFlowMutationOptions } from "./flowsQueryOptions";

export function usePublishFlowMutation(): UseMutationResult<
  PublishFlowDefinitionV3Response,
  Error,
  PublishFlowInput
> {
  const queryClient = useQueryClient();

  return useMutation(publishFlowMutationOptions(queryClient));
}
