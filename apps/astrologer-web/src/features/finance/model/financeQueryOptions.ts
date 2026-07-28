import type { QueryClient } from "@tanstack/react-query";
import type {
  CreateManualBankTransferPayoutMethod,
  CreatePayoutRequest,
  LedgerOperationListQuery
} from "@elevenhouse/contracts";
import { createManualBankTransferPayoutMethod } from "../api/createManualBankTransferPayoutMethod";
import { createPayoutRequest } from "../api/createPayoutRequest";
import { getCurrentFinanceOverview } from "../api/getCurrentFinanceOverview";
import { listFinanceOperations } from "../api/listFinanceOperations";

export const financeQueryKeys = {
  all: () => ["finance"] as const,
  current: () => ["finance", "current"] as const,
  operations: (query: LedgerOperationListQuery = {}) => ["finance", "operations", query] as const
};

export function currentFinanceOverviewQueryOptions() {
  return {
    queryKey: financeQueryKeys.current(),
    queryFn: () => getCurrentFinanceOverview()
  };
}

export function financeOperationsQueryOptions(query: LedgerOperationListQuery = {}) {
  return {
    queryKey: financeQueryKeys.operations(query),
    queryFn: () => listFinanceOperations(query)
  };
}

export function createManualPayoutMethodMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (body: CreateManualBankTransferPayoutMethod) =>
      createManualBankTransferPayoutMethod(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeQueryKeys.all() })
  };
}

export function createPayoutRequestMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (body: CreatePayoutRequest) => createPayoutRequest(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeQueryKeys.all() })
  };
}
