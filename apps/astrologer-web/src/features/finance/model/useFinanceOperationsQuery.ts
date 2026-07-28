import { useQuery } from "@tanstack/react-query";
import type { LedgerOperationListQuery } from "@elevenhouse/contracts";
import { financeOperationsQueryOptions } from "./financeQueryOptions";

export function useFinanceOperationsQuery(query: LedgerOperationListQuery = {}) {
  return useQuery(financeOperationsQueryOptions(query));
}
