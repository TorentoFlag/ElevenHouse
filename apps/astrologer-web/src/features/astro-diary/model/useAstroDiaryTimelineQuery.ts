import { useInfiniteQuery } from "@tanstack/react-query";
import { astroDiaryTimelineQueryOptions } from "./astroDiaryQueries";

export function useAstroDiaryTimelineQuery(journalId: string | undefined) {
  return useInfiniteQuery(astroDiaryTimelineQueryOptions(journalId));
}
