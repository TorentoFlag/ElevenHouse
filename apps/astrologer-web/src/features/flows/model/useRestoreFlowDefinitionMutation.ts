import { useMutation, useQueryClient } from "@tanstack/react-query";
import { restoreFlowDefinitionMutationOptions } from "./flowsQueryOptions";

export function useRestoreFlowDefinitionMutation() {
  const queryClient = useQueryClient();

  return useMutation(restoreFlowDefinitionMutationOptions(queryClient));
}
