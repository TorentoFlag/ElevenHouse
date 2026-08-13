import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { ProductStatusTransitionInput } from "../api/publishProduct";
import { archiveProductMutationOptions } from "./productsQueryOptions";

export function useArchiveProductMutation(): UseMutationResult<
  ProductResponse,
  Error,
  ProductStatusTransitionInput
> {
  const queryClient = useQueryClient();

  return useMutation(archiveProductMutationOptions(queryClient));
}
