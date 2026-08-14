import { useQuery } from "@tanstack/react-query";
import { astroDiaryJournalListQueryOptions } from "./astroDiaryQueries";

export function useAstroDiaryJournalListQuery() {
  return useQuery(astroDiaryJournalListQueryOptions());
}
