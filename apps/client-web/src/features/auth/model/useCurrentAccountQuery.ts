import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { AuthenticatedCustomerAccountResponse } from "@elevenhouse/contracts";
import { getCurrentAccount } from "../api/getCurrentAccount";
import { authQueryKeys } from "./authQueryKeys";

export function currentAccountQueryOptions() {
  return {
    queryKey: authQueryKeys.currentAccount(),
    queryFn: getCurrentAccount
  };
}

export function useCurrentAccountQuery(): UseQueryResult<AuthenticatedCustomerAccountResponse> {
  return useQuery(currentAccountQueryOptions());
}
