import type { ListFlowWorkItemsQuery } from "@elevenhouse/contracts";
import { useQuery } from "@tanstack/react-query";

import { flowOperatorQueueRefreshInterval, flowWorkItemsQueryOptions } from "./flowsQueryOptions";

export function useFlowWorkItemsQuery(query: ListFlowWorkItemsQuery) {
  return useQuery({
    ...flowWorkItemsQueryOptions(query),
    refetchInterval: (currentQuery) => flowOperatorQueueRefreshInterval(currentQuery.state.status)
  });
}
