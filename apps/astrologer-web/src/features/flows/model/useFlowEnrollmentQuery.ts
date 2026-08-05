import { useQuery } from "@tanstack/react-query";

import { flowEnrollmentQueryOptions } from "./flowsQueryOptions";

export function useFlowEnrollmentQuery(flowId: string | null) {
  return useQuery(flowEnrollmentQueryOptions(flowId));
}
