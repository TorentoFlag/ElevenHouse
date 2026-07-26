import type { CreatePayoutRequest, PayoutRequestResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { createPayoutRequestMutationOptions } from "./financeQueryOptions";

export function useCreatePayoutRequestMutation(): UseMutationResult<
  PayoutRequestResponse,
  Error,
  CreatePayoutRequest
> {
  const queryClient = useQueryClient();

  return useMutation(createPayoutRequestMutationOptions(queryClient));
}
