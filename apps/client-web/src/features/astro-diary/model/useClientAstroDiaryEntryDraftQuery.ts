import { useQuery } from "@tanstack/react-query";
import { clientAstroDiaryEntryDraftQueryOptions } from "./astroDiaryQueries";

export function useClientAstroDiaryEntryDraftQuery(journalId: string | undefined) {
  return useQuery(clientAstroDiaryEntryDraftQueryOptions(journalId));
}
