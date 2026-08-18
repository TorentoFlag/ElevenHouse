import type { AstroDiaryTimelinePage } from "@elevenhouse/contracts";
import type { QueryClient } from "@tanstack/react-query";
import {
  getClientAstroDiaryEntryDraft,
  getClientAstroDiaryJournal,
  getClientAstroDiaryTimeline,
  listClientAstroDiaryJournals
} from "../api/astroDiaryApi";

export const astroDiaryQueryKeys = {
  journals: () => ["client-astro-diary", "journals"] as const,
  journal: (journalId: string | undefined) =>
    ["client-astro-diary", "journals", journalId, "summary"] as const,
  timeline: (journalId: string | undefined) =>
    ["client-astro-diary", "journals", journalId, "timeline"] as const,
  entryDraft: (journalId: string | undefined) =>
    ["client-astro-diary", "journals", journalId, "client-entry-draft"] as const,
  relationship: () => ["client-astro-diary", "relationship"] as const
};

export function clientAstroDiaryJournalListQueryOptions(enabled = true) {
  return { queryKey: astroDiaryQueryKeys.journals(), queryFn: listClientAstroDiaryJournals, enabled };
}

export function clientAstroDiaryJournalQueryOptions(journalId: string | undefined) {
  return {
    queryKey: astroDiaryQueryKeys.journal(journalId),
    queryFn: () => getClientAstroDiaryJournal(journalId ?? ""),
    enabled: Boolean(journalId)
  };
}

export function clientAstroDiaryTimelineQueryOptions(journalId: string | undefined) {
  return {
    queryKey: astroDiaryQueryKeys.timeline(journalId),
    queryFn: ({ pageParam }: { pageParam: number }) =>
      getClientAstroDiaryTimeline({ journalId: journalId ?? "", afterCursor: pageParam, limit: 50 }),
    initialPageParam: 0,
    getNextPageParam: getNextAstroDiaryTimelinePageParam,
    enabled: Boolean(journalId)
  };
}

export function clientAstroDiaryEntryDraftQueryOptions(journalId: string | undefined) {
  return {
    queryKey: astroDiaryQueryKeys.entryDraft(journalId),
    queryFn: () => getClientAstroDiaryEntryDraft(journalId ?? ""),
    enabled: Boolean(journalId)
  };
}

export function getNextAstroDiaryTimelinePageParam(
  page: AstroDiaryTimelinePage
): number | undefined {
  return page.hasMore && page.nextCursor !== null ? page.nextCursor : undefined;
}

export async function invalidateClientAstroDiaryDraftSave(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  journalId: string
): Promise<void> {
  await invalidateSummary(queryClient, journalId);
  await queryClient.invalidateQueries({
    queryKey: astroDiaryQueryKeys.entryDraft(journalId),
    exact: true
  });
}

export async function invalidateClientAstroDiaryPublish(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  journalId: string
): Promise<void> {
  await invalidateSummary(queryClient, journalId);
  await queryClient.invalidateQueries({
    queryKey: astroDiaryQueryKeys.entryDraft(journalId),
    exact: true
  });
  await queryClient.invalidateQueries({ queryKey: astroDiaryQueryKeys.timeline(journalId), exact: true });
}

async function invalidateSummary(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  journalId: string
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: astroDiaryQueryKeys.journals(), exact: true });
  await queryClient.invalidateQueries({ queryKey: astroDiaryQueryKeys.journal(journalId), exact: true });
}
