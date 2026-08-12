import { useMutation, useQueryClient } from "@tanstack/react-query";
import { duplicateFlowDefinitionMutationOptions } from "./flowsQueryOptions";

export function useDuplicateFlowDefinitionMutation() {
  const queryClient = useQueryClient();

  return useMutation(duplicateFlowDefinitionMutationOptions(queryClient));
}
