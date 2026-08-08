import type { ListFlowRunsQuery } from "@elevenhouse/contracts";
import { useQuery } from "@tanstack/react-query";
import { flowRunsQueryOptions, flowRunsRefreshInterval } from "./flowsQueryOptions";

export function useFlowRunsQuery(flowId: string | null, query: ListFlowRunsQuery) {
  return useQuery({
    ...flowRunsQueryOptions(flowId ?? "__no-flow__", query),
    enabled: Boolean(flowId),
    refetchInterval: (currentQuery) => flowRunsRefreshInterval(currentQuery.state.data)
  });
}
