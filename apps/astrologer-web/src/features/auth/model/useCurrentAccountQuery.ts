import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { AuthenticatedAstrologerAccountResponse } from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";
import { getCurrentAccount } from "../api/getCurrentAccount";
import { authQueryKeys } from "./authQueryKeys";

export function currentAccountQueryOptions() {
  return {
    queryKey: authQueryKeys.currentAccount(),
    queryFn: getCurrentAccount,
    retry: (failureCount: number, error: Error) => {
      if (error instanceof HttpError && error.status === 401) {
        return false;
      }

      return failureCount < 2;
    }
  };
}

export function useCurrentAccountQuery(): UseQueryResult<AuthenticatedAstrologerAccountResponse> {
  return useQuery(currentAccountQueryOptions());
}
