import type { ProductResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { CreateProductFromTemplateInput } from "../api/createProductFromTemplate";
import { createProductFromTemplateMutationOptions } from "./productsQueryOptions";

export function useCreateProductFromTemplateMutation(): UseMutationResult<
  ProductResponse,
  Error,
  CreateProductFromTemplateInput
> {
  const queryClient = useQueryClient();

  return useMutation(createProductFromTemplateMutationOptions(queryClient));
}
