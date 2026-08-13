import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { ProductStatusTransitionInput } from "../api/publishProduct";
import { moveProductToDraftMutationOptions } from "./productsQueryOptions";

export function useMoveProductToDraftMutation(): UseMutationResult<
  ProductResponse,
  Error,
  ProductStatusTransitionInput
> {
  const queryClient = useQueryClient();

  return useMutation(moveProductToDraftMutationOptions(queryClient));
}
