import type { StartAstrologerTariffSubscriptionInput } from "../api/platformTariffsApi";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { StartAstrologerTariffSubscriptionResponse } from "@elevenhouse/contracts";
import { startAstrologerTariffSubscriptionMutationOptions } from "./platformTariffsQueryOptions";

export function useStartAstrologerTariffSubscriptionMutation(): UseMutationResult<
  StartAstrologerTariffSubscriptionResponse,
  Error,
  StartAstrologerTariffSubscriptionInput
> {
  const queryClient = useQueryClient();

  return useMutation(startAstrologerTariffSubscriptionMutationOptions(queryClient));
}
