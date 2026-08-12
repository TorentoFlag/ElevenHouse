import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteFlowDefinitionMutationOptions } from "./flowsQueryOptions";

export function useDeleteFlowDefinitionMutation() {
  const queryClient = useQueryClient();

  return useMutation(deleteFlowDefinitionMutationOptions(queryClient));
}
