import { useInfiniteQuery } from "@tanstack/react-query";
import type { LedgerOperationListQuery } from "@elevenhouse/contracts";
import { financeOperationsInfiniteQueryOptions } from "./financeQueryOptions";

export function useFinanceOperationsQuery(query: LedgerOperationListQuery = {}) {
  return useInfiniteQuery(financeOperationsInfiniteQueryOptions(query));
}
