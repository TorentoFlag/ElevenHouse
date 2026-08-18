import { useQuery } from "@tanstack/react-query";
import { clientAstroDiaryJournalListQueryOptions } from "./astroDiaryQueries";

export function useClientAstroDiaryJournalListQuery(enabled: boolean) {
  return useQuery(clientAstroDiaryJournalListQueryOptions(enabled));
}
