import { listAstroDiaryJournals } from "../api/astroDiaryApi";

export const astroDiaryQueryKeys = {
  all: () => ["astro-diary"] as const,
  journals: () => ["astro-diary", "journals"] as const
};

export function astroDiaryJournalListQueryOptions() {
  return {
    queryKey: astroDiaryQueryKeys.journals(),
    queryFn: () => listAstroDiaryJournals()
  };
}
