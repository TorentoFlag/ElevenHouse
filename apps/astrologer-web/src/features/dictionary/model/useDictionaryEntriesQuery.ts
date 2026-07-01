import { useQuery } from "@tanstack/react-query";
import type { DictionaryEntriesQuery } from "@elevenhouse/contracts";
import { dictionaryEntriesQueryOptions } from "./dictionaryQueryOptions";

export function useDictionaryEntriesQuery(query: DictionaryEntriesQuery) {
  return useQuery(dictionaryEntriesQueryOptions(query));
}
