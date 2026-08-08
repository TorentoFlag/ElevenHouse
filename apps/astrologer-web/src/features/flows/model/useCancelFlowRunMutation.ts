import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cancelFlowRunMutationOptions } from "./flowsQueryOptions";

export function useCancelFlowRunMutation() {
  const queryClient = useQueryClient();
  return useMutation(cancelFlowRunMutationOptions(queryClient));
}
