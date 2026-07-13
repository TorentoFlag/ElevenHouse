import type {
  CreateProductRequest,
  ListProductsQuery,
  ProductResponse,
  ProductTemplateLocale
} from "@elevenhouse/contracts";
import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import { archiveProduct } from "../api/archiveProduct";
import { createProduct } from "../api/createProduct";
import { createProductFromTemplate } from "../api/createProductFromTemplate";
import type { CreateProductFromTemplateInput } from "../api/createProductFromTemplate";
import { duplicateProduct } from "../api/duplicateProduct";
import type { DuplicateProductInput } from "../api/duplicateProduct";
import { getProduct } from "../api/getProduct";
import { getProductSummary } from "../api/getProductSummary";
import { listProducts } from "../api/listProducts";
import { listProductTemplates } from "../api/listProductTemplates";
import { moveProductToDraft } from "../api/moveProductToDraft";
import { publishProduct } from "../api/publishProduct";
import { updateProduct, type UpdateProductInput } from "../api/updateProduct";

export const productsQueryKeys = {
  all: () => ["products"] as const,
  list: (query: ListProductsQuery) => ["products", "list", query] as const,
  summary: () => ["products", "summary"] as const,
  detail: (productId: string) => ["products", "detail", productId] as const,
  templates: (locale: ProductTemplateLocale) => ["products", "templates", locale] as const
};

export function productListQueryOptions(query: ListProductsQuery) {
  return {
    queryKey: productsQueryKeys.list(query),
    queryFn: () => listProducts(query),
    placeholderData: keepPreviousData
  };
}

export function productSummaryQueryOptions() {
  return {
    queryKey: productsQueryKeys.summary(),
    queryFn: () => getProductSummary()
  };
}

export function productDetailQueryOptions(productId: string) {
  return {
    queryKey: productsQueryKeys.detail(productId),
    queryFn: () => getProduct(productId)
  };
}

export function productTemplatesQueryOptions(locale: ProductTemplateLocale) {
  return {
    queryKey: productsQueryKeys.templates(locale),
    queryFn: () => listProductTemplates({ locale })
  };
}

export function createProductMutationOptions(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return {
    mutationFn: (body: CreateProductRequest) => createProduct(body),
    onSuccess: () => invalidateProducts(queryClient)
  };
}

export function createProductFromTemplateMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: CreateProductFromTemplateInput) => createProductFromTemplate(input),
    onSuccess: () => invalidateProducts(queryClient)
  };
}

export function updateProductMutationOptions(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return {
    mutationFn: (input: UpdateProductInput) => updateProduct(input),
    onSuccess: () => invalidateProducts(queryClient)
  };
}

export function publishProductMutationOptions(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return {
    mutationFn: (productId: string) => publishProduct(productId),
    onSuccess: () => invalidateProducts(queryClient)
  };
}

export function moveProductToDraftMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (productId: string) => moveProductToDraft(productId),
    onSuccess: () => invalidateProducts(queryClient)
  };
}

export function archiveProductMutationOptions(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return {
    mutationFn: (productId: string) => archiveProduct(productId),
    onSuccess: () => invalidateProducts(queryClient)
  };
}

export function duplicateProductMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: DuplicateProductInput) => duplicateProduct(input),
    onSuccess: () => invalidateProducts(queryClient)
  };
}

function invalidateProducts(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return queryClient.invalidateQueries({ queryKey: productsQueryKeys.all() });
}

export type ProductMutationResult = ProductResponse;
