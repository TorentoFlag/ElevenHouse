import type { DictionaryEntriesQuery, ListDictionaryCategoriesQuery } from "@elevenhouse/contracts";

export type DictionaryEntriesInfiniteQuery = Omit<DictionaryEntriesQuery, "offset">;

export const dictionaryQueryKeys = {
  all: () => ["dictionary"] as const,
  categories: (query: ListDictionaryCategoriesQuery) =>
    ["dictionary", "categories", query] as const,
  entries: (query: DictionaryEntriesQuery) => ["dictionary", "entries", query] as const,
  infiniteEntries: (query: DictionaryEntriesInfiniteQuery) =>
    ["dictionary", "entries", "infinite", query] as const
};
