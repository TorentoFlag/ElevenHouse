import type {
  AstroCalendarGenerationRequest,
  AstroCalendarRangeQuery,
  AstroCalendarRangeResponse,
  DictionaryEntriesByCodesQuery
} from "@elevenhouse/contracts";
import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import { listDictionaryEntriesByCodes } from "../../dictionary/api/listDictionaryEntriesByCodes";
import {
  createAstroCalendarGeneration,
  getAstroCalendarRange,
  retryAstroCalendarGeneration
} from "../api/astroCalendarApi";

export const astroCalendarQueryKeys = {
  all: () => ["astro-calendar"] as const,
  range: (query: AstroCalendarRangeQuery) => ["astro-calendar", "range", query] as const,
  dictionaryEntries: (query: DictionaryEntriesByCodesQuery) =>
    ["astro-calendar", "dictionary-entries", query] as const
};

export function astroCalendarRangeQueryOptions(query: AstroCalendarRangeQuery, enabled = true) {
  return {
    queryKey: astroCalendarQueryKeys.range(query),
    queryFn: () => getAstroCalendarRange(query),
    placeholderData: keepPreviousData,
    refetchInterval: astroCalendarRangeRefetchInterval,
    enabled
  };
}

export function astroCalendarRangeRefetchInterval(query: {
  readonly state: { readonly data?: AstroCalendarRangeResponse };
}) {
  return query.state.data?.generation.status === "calculating" ? 2_000 : false;
}

export function astroCalendarDictionaryEntriesQueryOptions(
  query: DictionaryEntriesByCodesQuery,
  enabled = true
) {
  return {
    queryKey: astroCalendarQueryKeys.dictionaryEntries(query),
    queryFn: () => listDictionaryEntriesByCodes(query),
    placeholderData: keepPreviousData,
    enabled: enabled && query.codes.length > 0
  };
}

export function astroCalendarGenerationMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: AstroCalendarGenerationRequest) => createAstroCalendarGeneration(input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: astroCalendarQueryKeys.all()
      })
  };
}

export function astroCalendarRetryMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (generationId: string) => retryAstroCalendarGeneration(generationId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: astroCalendarQueryKeys.all()
      })
  };
}
