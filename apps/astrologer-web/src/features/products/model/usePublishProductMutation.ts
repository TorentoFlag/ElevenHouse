import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { publishProductMutationOptions } from "./productsQueryOptions";

export function usePublishProductMutation(): UseMutationResult<ProductResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation(publishProductMutationOptions(queryClient));
}
