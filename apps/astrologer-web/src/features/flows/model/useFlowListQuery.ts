import type { ListFlowDefinitionsV2QueryInput } from "@elevenhouse/contracts";
import { useQuery } from "@tanstack/react-query";
import { flowListQueryOptions } from "./flowsQueryOptions";

export function useFlowListQuery(query: ListFlowDefinitionsV2QueryInput) {
  return useQuery(flowListQueryOptions(query));
}
