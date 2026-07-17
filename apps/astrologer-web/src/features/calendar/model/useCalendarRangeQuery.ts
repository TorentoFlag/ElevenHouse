import type { CalendarRangeQuery } from "@elevenhouse/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getCalendarRange } from "../api/getCalendarRange";

export const calendarQueryKeys = {
  all: () => ["calendar"] as const,
  range: (query: CalendarRangeQuery) => ["calendar", "range", query] as const
};

export function calendarRangeQueryOptions(query: CalendarRangeQuery, enabled = true) {
  return {
    queryKey: calendarQueryKeys.range(query),
    queryFn: () => getCalendarRange(query),
    placeholderData: keepPreviousData,
    enabled
  };
}

export function useCalendarRangeQuery(query: CalendarRangeQuery, enabled = true) {
  return useQuery(calendarRangeQueryOptions(query, enabled));
}
