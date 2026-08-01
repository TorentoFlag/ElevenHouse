import { useMutation, useQueryClient } from "@tanstack/react-query";
import { activateFlowMutationOptions } from "./flowsQueryOptions";

export function useActivateFlowMutation() {
  const queryClient = useQueryClient();

  return useMutation(activateFlowMutationOptions(queryClient));
}
