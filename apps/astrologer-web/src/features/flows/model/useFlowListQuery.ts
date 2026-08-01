import type { ListFlowsQuery } from "@elevenhouse/contracts";
import { useQuery } from "@tanstack/react-query";
import { flowListQueryOptions } from "./flowsQueryOptions";

export function useFlowListQuery(query: ListFlowsQuery) {
  return useQuery(flowListQueryOptions(query));
}
