import { useMutation, useQueryClient } from "@tanstack/react-query";

import { snoozeFlowWorkItemMutationOptions } from "./flowsQueryOptions";

export function useSnoozeFlowWorkItemMutation() {
  const queryClient = useQueryClient();
  return useMutation(snoozeFlowWorkItemMutationOptions(queryClient));
}
