import { getAstroDiaryTimeline, listAstroDiaryJournals } from "../api/astroDiaryApi";

export const astroDiaryQueryKeys = {
  all: () => ["astro-diary"] as const,
  journals: () => ["astro-diary", "journals"] as const,
  timeline: (journalId: string | undefined) =>
    ["astro-diary", "journals", journalId, "timeline"] as const
};

export function astroDiaryJournalListQueryOptions() {
  return {
    queryKey: astroDiaryQueryKeys.journals(),
    queryFn: () => listAstroDiaryJournals()
  };
}

export function astroDiaryTimelineQueryOptions(journalId: string | undefined) {
  return {
    queryKey: astroDiaryQueryKeys.timeline(journalId),
    queryFn: () =>
      getAstroDiaryTimeline({
        journalId: journalId ?? "",
        afterCursor: 0,
        limit: 50
      }),
    enabled: Boolean(journalId)
  };
}
