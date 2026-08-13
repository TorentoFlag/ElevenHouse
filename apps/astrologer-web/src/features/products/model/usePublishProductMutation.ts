import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { ProductStatusTransitionInput } from "../api/publishProduct";
import { publishProductMutationOptions } from "./productsQueryOptions";

export function usePublishProductMutation(): UseMutationResult<
  ProductResponse,
  Error,
  ProductStatusTransitionInput
> {
  const queryClient = useQueryClient();

  return useMutation(publishProductMutationOptions(queryClient));
}
