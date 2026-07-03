import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { archiveProductMutationOptions } from "./productsQueryOptions";

export function useArchiveProductMutation(): UseMutationResult<ProductResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation(archiveProductMutationOptions(queryClient));
}
