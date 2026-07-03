import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { UpdateProductInput } from "../api/updateProduct";
import { updateProductMutationOptions } from "./productsQueryOptions";

export function useUpdateProductMutation(): UseMutationResult<
  ProductResponse,
  Error,
  UpdateProductInput
> {
  const queryClient = useQueryClient();

  return useMutation(updateProductMutationOptions(queryClient));
}
