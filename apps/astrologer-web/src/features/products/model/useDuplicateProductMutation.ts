import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { DuplicateProductInput } from "../api/duplicateProduct";
import { duplicateProductMutationOptions } from "./productsQueryOptions";

export function useDuplicateProductMutation(): UseMutationResult<
  ProductResponse,
  Error,
  DuplicateProductInput
> {
  const queryClient = useQueryClient();

  return useMutation(duplicateProductMutationOptions(queryClient));
}
