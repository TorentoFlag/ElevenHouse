import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { duplicateProductMutationOptions } from "./productsQueryOptions";

export function useDuplicateProductMutation(): UseMutationResult<ProductResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation(duplicateProductMutationOptions(queryClient));
}
