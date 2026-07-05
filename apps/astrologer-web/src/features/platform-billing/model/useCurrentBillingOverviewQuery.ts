import { useQuery } from "@tanstack/react-query";
import { currentBillingOverviewQueryOptions } from "./platformBillingQueryOptions";

export function useCurrentBillingOverviewQuery() {
  return useQuery(currentBillingOverviewQueryOptions());
}
