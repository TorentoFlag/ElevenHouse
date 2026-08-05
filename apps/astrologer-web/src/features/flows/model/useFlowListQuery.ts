import type { ListFlowDefinitionsV3QueryInput } from "@elevenhouse/contracts";
import { useQuery } from "@tanstack/react-query";
import { flowListQueryOptions } from "./flowsQueryOptions";

export function useFlowListQuery(query: ListFlowDefinitionsV3QueryInput) {
  return useQuery(flowListQueryOptions(query));
}
