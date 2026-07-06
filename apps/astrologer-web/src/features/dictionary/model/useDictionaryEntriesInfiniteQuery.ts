import { useInfiniteQuery } from "@tanstack/react-query";
import type { DictionaryEntriesInfiniteQuery } from "./dictionaryQueryKeys";
import { dictionaryEntriesInfiniteQueryOptions } from "./dictionaryQueryOptions";

export function useDictionaryEntriesInfiniteQuery(query: DictionaryEntriesInfiniteQuery) {
  return useInfiniteQuery(dictionaryEntriesInfiniteQueryOptions(query));
}
