import type { DictionaryEntriesQuery, ListDictionaryCategoriesQuery } from "@elevenhouse/contracts";

export const dictionaryQueryKeys = {
  categories: (query: ListDictionaryCategoriesQuery) => ["dictionary", "categories", query] as const,
  entries: (query: DictionaryEntriesQuery) => ["dictionary", "entries", query] as const
};
