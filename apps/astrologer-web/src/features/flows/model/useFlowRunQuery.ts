import { useQuery } from "@tanstack/react-query";

import { flowRunQueryOptions, flowRunRefreshInterval } from "./flowsQueryOptions";

export function useFlowRunQuery(runId: string | null) {
  return useQuery({
    ...flowRunQueryOptions(runId),
    refetchInterval: (currentQuery) => flowRunRefreshInterval(currentQuery.state.data?.run)
  });
}
