import type { FlowDefinitionV2 } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { CreateFlowInput } from "../api/createFlow";
import { createFlowMutationOptions } from "./flowsQueryOptions";

export function useCreateFlowMutation(): UseMutationResult<
  FlowDefinitionV2,
  Error,
  CreateFlowInput
> {
  const queryClient = useQueryClient();

  return useMutation(createFlowMutationOptions(queryClient));
}
