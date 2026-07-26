import type {
  CreateManualBankTransferPayoutMethod,
  PayoutMethodResponse
} from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { createManualPayoutMethodMutationOptions } from "./financeQueryOptions";

export function useCreateManualPayoutMethodMutation(): UseMutationResult<
  PayoutMethodResponse,
  Error,
  CreateManualBankTransferPayoutMethod
> {
  const queryClient = useQueryClient();

  return useMutation(createManualPayoutMethodMutationOptions(queryClient));
}
