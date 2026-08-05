import { useMutation, useQueryClient } from "@tanstack/react-query";

import { pauseFlowEnrollmentMutationOptions } from "./flowsQueryOptions";

export function usePauseFlowEnrollmentMutation() {
  const queryClient = useQueryClient();
  return useMutation(pauseFlowEnrollmentMutationOptions(queryClient));
}
