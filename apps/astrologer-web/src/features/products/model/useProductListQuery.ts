import { useQuery } from "@tanstack/react-query";
import type { ListProductsQuery } from "@elevenhouse/contracts";
import { productListQueryOptions } from "./productsQueryOptions";

export function useProductListQuery(query: ListProductsQuery) {
  return useQuery(productListQueryOptions(query));
}
