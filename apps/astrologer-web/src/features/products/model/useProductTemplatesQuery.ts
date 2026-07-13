import type { ProductTemplateLocale } from "@elevenhouse/contracts";
import { useQuery } from "@tanstack/react-query";
import { productTemplatesQueryOptions } from "./productsQueryOptions";

export function useProductTemplatesQuery(locale: ProductTemplateLocale) {
  return useQuery(productTemplatesQueryOptions(locale));
}
