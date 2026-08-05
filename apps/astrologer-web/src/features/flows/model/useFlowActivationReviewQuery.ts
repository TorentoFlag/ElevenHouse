import { useQuery } from "@tanstack/react-query";

import { flowActivationReviewQueryOptions } from "./flowsQueryOptions";

export function useFlowActivationReviewQuery(
  flowId: string | null,
  versionId: string | null
) {
  return useQuery(flowActivationReviewQueryOptions(flowId, versionId));
}
