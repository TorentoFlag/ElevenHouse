import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pauseFlowMutationOptions } from "./flowsQueryOptions";

export function usePauseFlowMutation() {
  const queryClient = useQueryClient();

  return useMutation(pauseFlowMutationOptions(queryClient));
}
