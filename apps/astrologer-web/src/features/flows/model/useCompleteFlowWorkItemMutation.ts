import { useMutation, useQueryClient } from "@tanstack/react-query";

import { completeFlowWorkItemMutationOptions } from "./flowsQueryOptions";

export function useCompleteFlowWorkItemMutation() {
  const queryClient = useQueryClient();
  return useMutation(completeFlowWorkItemMutationOptions(queryClient));
}
