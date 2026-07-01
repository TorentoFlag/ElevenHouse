import { useQuery } from "@tanstack/react-query";
import type { ListDictionaryCategoriesQuery } from "@elevenhouse/contracts";
import { dictionaryCategoriesQueryOptions } from "./dictionaryQueryOptions";

export function useDictionaryCategoriesQuery(query: ListDictionaryCategoriesQuery) {
  return useQuery(dictionaryCategoriesQueryOptions(query));
}
