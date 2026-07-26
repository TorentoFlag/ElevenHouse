import type { AstroCalendarRangeQuery } from "@elevenhouse/contracts";
import { useQuery } from "@tanstack/react-query";
import { astroCalendarRangeQueryOptions } from "./astroCalendarQueries";

export function useAstroCalendarRangeQuery(query: AstroCalendarRangeQuery, enabled = true) {
  return useQuery(astroCalendarRangeQueryOptions(query, enabled));
}
