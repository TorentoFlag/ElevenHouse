import type { ListFlowRunsQuery } from "@elevenhouse/contracts";
import { useQuery } from "@tanstack/react-query";
import { flowRunsQueryOptions } from "./flowsQueryOptions";

export function useFlowRunsQuery(flowId: string | null, query: ListFlowRunsQuery) {
  return useQuery({
    ...flowRunsQueryOptions(flowId ?? "__no-flow__", query),
    enabled: Boolean(flowId)
  });
}
