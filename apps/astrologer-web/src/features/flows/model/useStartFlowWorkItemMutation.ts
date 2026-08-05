import { useMutation, useQueryClient } from "@tanstack/react-query";

import { startFlowWorkItemMutationOptions } from "./flowsQueryOptions";

export function useStartFlowWorkItemMutation() {
  const queryClient = useQueryClient();
  return useMutation(startFlowWorkItemMutationOptions(queryClient));
}
