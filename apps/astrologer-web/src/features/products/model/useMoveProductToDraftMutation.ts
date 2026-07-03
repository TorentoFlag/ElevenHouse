import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { moveProductToDraftMutationOptions } from "./productsQueryOptions";

export function useMoveProductToDraftMutation(): UseMutationResult<ProductResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation(moveProductToDraftMutationOptions(queryClient));
}
