import type { DictionaryEntriesQuery, ListDictionaryCategoriesQuery } from "@elevenhouse/contracts";

export const dictionaryQueryKeys = {
  all: () => ["dictionary"] as const,
  categories: (query: ListDictionaryCategoriesQuery) =>
    ["dictionary", "categories", query] as const,
  entries: (query: DictionaryEntriesQuery) => ["dictionary", "entries", query] as const
};
