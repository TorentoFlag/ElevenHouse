import type { AstroDiaryTimelinePage } from "@elevenhouse/contracts";
import type { QueryClient } from "@tanstack/react-query";
import {
  getAstroDiaryJournal,
  getAstroDiaryReplyDraft,
  getAstroDiaryTimeline,
  listAstroDiaryJournals
} from "../api/astroDiaryApi";

export const astroDiaryQueryKeys = {
  all: () => ["astro-diary"] as const,
  journals: () => ["astro-diary", "journals"] as const,
  journal: (journalId: string | undefined) =>
    ["astro-diary", "journals", journalId, "summary"] as const,
  timeline: (journalId: string | undefined) =>
    ["astro-diary", "journals", journalId, "timeline"] as const,
  replyDraft: (journalId: string | undefined) =>
    ["astro-diary", "journals", journalId, "astrologer-reply-draft"] as const
};

export function astroDiaryJournalListQueryOptions() {
  return {
    queryKey: astroDiaryQueryKeys.journals(),
    queryFn: () => listAstroDiaryJournals()
  };
}

export function astroDiaryJournalQueryOptions(journalId: string | undefined) {
  return {
    queryKey: astroDiaryQueryKeys.journal(journalId),
    queryFn: () => getAstroDiaryJournal(journalId ?? ""),
    enabled: Boolean(journalId)
  };
}

export function astroDiaryTimelineQueryOptions(journalId: string | undefined) {
  return {
    queryKey: astroDiaryQueryKeys.timeline(journalId),
    queryFn: ({ pageParam }: { pageParam: number }) =>
      getAstroDiaryTimeline({
        journalId: journalId ?? "",
        afterCursor: pageParam,
        limit: 50
      }),
    initialPageParam: 0,
    getNextPageParam: getNextAstroDiaryTimelinePageParam,
    enabled: Boolean(journalId)
  };
}

export function astroDiaryReplyDraftQueryOptions(journalId: string | undefined) {
  return {
    queryKey: astroDiaryQueryKeys.replyDraft(journalId),
    queryFn: () => getAstroDiaryReplyDraft(journalId ?? ""),
    enabled: Boolean(journalId)
  };
}

export function getNextAstroDiaryTimelinePageParam(
  page: AstroDiaryTimelinePage
): number | undefined {
  return page.hasMore && page.nextCursor !== null ? page.nextCursor : undefined;
}

export async function invalidateAstroDiaryJournal(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  journalId: string
): Promise<void> {
  await invalidateAstroDiaryJournalSummary(queryClient, journalId);
  await queryClient.invalidateQueries({
    queryKey: astroDiaryQueryKeys.timeline(journalId),
    exact: true
  });
  await queryClient.invalidateQueries({
    queryKey: astroDiaryQueryKeys.replyDraft(journalId),
    exact: true
  });
}

export async function invalidateAstroDiaryReplyDraftSave(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  journalId: string
): Promise<void> {
  await invalidateAstroDiaryJournalSummary(queryClient, journalId);
  await queryClient.invalidateQueries({
    queryKey: astroDiaryQueryKeys.replyDraft(journalId),
    exact: true
  });
}

export async function invalidateAstroDiaryJournalSummary(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  journalId: string
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: astroDiaryQueryKeys.journals(), exact: true });
  await queryClient.invalidateQueries({
    queryKey: astroDiaryQueryKeys.journal(journalId),
    exact: true
  });
}
