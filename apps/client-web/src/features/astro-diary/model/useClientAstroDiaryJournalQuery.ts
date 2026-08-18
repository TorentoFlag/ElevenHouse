import { useQuery } from "@tanstack/react-query";
import { clientAstroDiaryJournalQueryOptions } from "./astroDiaryQueries";

export function useClientAstroDiaryJournalQuery(journalId: string | undefined) {
  return useQuery(clientAstroDiaryJournalQueryOptions(journalId));
}
