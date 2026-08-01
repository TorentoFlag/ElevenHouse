import type { ListFlowApprovalsQuery } from "@elevenhouse/contracts";
import { useQuery } from "@tanstack/react-query";
import { flowApprovalsQueryOptions } from "./flowsQueryOptions";

export function useFlowApprovalsQuery(query: ListFlowApprovalsQuery) {
  return useQuery(flowApprovalsQueryOptions(query));
}
