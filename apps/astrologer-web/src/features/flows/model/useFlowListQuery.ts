import type { ListFlowDefinitionsQueryInput } from "@elevenhouse/contracts";
import { useQuery } from "@tanstack/react-query";
import { flowListQueryOptions } from "./flowsQueryOptions";

export function useFlowListQuery(query: ListFlowDefinitionsQueryInput) {
  return useQuery(flowListQueryOptions(query));
}
