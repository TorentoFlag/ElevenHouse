import type { QueryClient } from "@tanstack/react-query";
import type {
  CreateManualBankTransferPayoutMethod,
  CreatePayoutRequest
} from "@elevenhouse/contracts";
import { createManualBankTransferPayoutMethod } from "../api/createManualBankTransferPayoutMethod";
import { createPayoutRequest } from "../api/createPayoutRequest";
import { getCurrentFinanceOverview } from "../api/getCurrentFinanceOverview";

export const financeQueryKeys = {
  all: () => ["finance"] as const,
  current: () => ["finance", "current"] as const
};

export function currentFinanceOverviewQueryOptions() {
  return {
    queryKey: financeQueryKeys.current(),
    queryFn: () => getCurrentFinanceOverview()
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
