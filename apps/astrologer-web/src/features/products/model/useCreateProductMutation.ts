import type { CreateProductRequest, ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { createProductMutationOptions } from "./productsQueryOptions";

export function useCreateProductMutation(): UseMutationResult<
  ProductResponse,
  Error,
  CreateProductRequest
> {
  const queryClient = useQueryClient();

  return useMutation(createProductMutationOptions(queryClient));
}
