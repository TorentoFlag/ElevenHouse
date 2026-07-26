import { useQuery } from "@tanstack/react-query";
import { currentFinanceOverviewQueryOptions } from "./financeQueryOptions";

export function useCurrentFinanceOverviewQuery() {
  return useQuery(currentFinanceOverviewQueryOptions());
}
