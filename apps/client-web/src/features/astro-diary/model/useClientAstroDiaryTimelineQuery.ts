import { useInfiniteQuery } from "@tanstack/react-query";
import { clientAstroDiaryTimelineQueryOptions } from "./astroDiaryQueries";

export function useClientAstroDiaryTimelineQuery(journalId: string | undefined) {
  return useInfiniteQuery(clientAstroDiaryTimelineQueryOptions(journalId));
}
