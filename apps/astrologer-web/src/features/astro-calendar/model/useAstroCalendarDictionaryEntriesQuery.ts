import type { DictionaryEntriesByCodesQuery } from "@elevenhouse/contracts";
import { useQuery } from "@tanstack/react-query";
import { astroCalendarDictionaryEntriesQueryOptions } from "./astroCalendarQueries";

export function useAstroCalendarDictionaryEntriesQuery(
  query: DictionaryEntriesByCodesQuery,
  enabled = true
) {
  return useQuery(astroCalendarDictionaryEntriesQueryOptions(query, enabled));
}
