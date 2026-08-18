import { useQuery } from "@tanstack/react-query";
import { astroDiaryJournalQueryOptions } from "./astroDiaryQueries";

export function useAstroDiaryJournalQuery(journalId: string | undefined) {
  return useQuery(astroDiaryJournalQueryOptions(journalId));
}
