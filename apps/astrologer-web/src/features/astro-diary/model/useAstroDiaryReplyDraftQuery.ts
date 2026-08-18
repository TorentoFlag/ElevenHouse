import { useQuery } from "@tanstack/react-query";
import { astroDiaryReplyDraftQueryOptions } from "./astroDiaryQueries";

export function useAstroDiaryReplyDraftQuery(journalId: string | undefined) {
  return useQuery(astroDiaryReplyDraftQueryOptions(journalId));
}
