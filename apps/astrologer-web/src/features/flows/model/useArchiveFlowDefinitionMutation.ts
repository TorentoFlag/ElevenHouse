import { useMutation, useQueryClient } from "@tanstack/react-query";
import { archiveFlowDefinitionMutationOptions } from "./flowsQueryOptions";

export function useArchiveFlowDefinitionMutation() {
  const queryClient = useQueryClient();

  return useMutation(archiveFlowDefinitionMutationOptions(queryClient));
}
