import type { DictionaryEntriesQuery, ListDictionaryCategoriesQuery } from "@elevenhouse/contracts";
import { listDictionaryCategories } from "../api/listDictionaryCategories";
import { listDictionaryEntries } from "../api/listDictionaryEntries";
import { dictionaryQueryKeys } from "./dictionaryQueryKeys";

export function dictionaryCategoriesQueryOptions(query: ListDictionaryCategoriesQuery) {
  return {
    queryKey: dictionaryQueryKeys.categories(query),
    queryFn: () => listDictionaryCategories(query)
  };
}

export function dictionaryEntriesQueryOptions(query: DictionaryEntriesQuery) {
  return {
    queryKey: dictionaryQueryKeys.entries(query),
    queryFn: () => listDictionaryEntries(query)
  };
}
