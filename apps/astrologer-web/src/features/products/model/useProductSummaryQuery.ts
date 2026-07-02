import { useQuery } from "@tanstack/react-query";
import { productSummaryQueryOptions } from "./productsQueryOptions";

export function useProductSummaryQuery() {
  return useQuery(productSummaryQueryOptions());
}
