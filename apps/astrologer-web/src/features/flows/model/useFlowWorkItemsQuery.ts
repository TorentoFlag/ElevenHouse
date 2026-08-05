import type { ListFlowWorkItemsQuery } from "@elevenhouse/contracts";
import { useQuery } from "@tanstack/react-query";

import { flowWorkItemsQueryOptions } from "./flowsQueryOptions";

export function useFlowWorkItemsQuery(query: ListFlowWorkItemsQuery) {
  return useQuery(flowWorkItemsQueryOptions(query));
}
