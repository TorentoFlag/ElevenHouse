import type {
  AstroDiaryJournalSummaryResponse,
  AstroDiaryTimelineItem,
  AstroDiaryTimelinePage
} from "@elevenhouse/contracts";

export function resolveAstroDiarySelection(
  selectedJournalId: string | undefined,
  journals: readonly AstroDiaryJournalSummaryResponse[]
): string | undefined {
  if (selectedJournalId && journals.some(({ journal }) => journal.id === selectedJournalId)) {
    return selectedJournalId;
  }
  return journals[0]?.journal.id;
}

export function collectAstroDiaryTimelineItems(
  pages: readonly AstroDiaryTimelinePage[] | undefined
): readonly AstroDiaryTimelineItem[] {
  return pages?.flatMap(({ items }) => items) ?? [];
}

export function isAstroDiaryReplyActionable(
  summary: AstroDiaryJournalSummaryResponse
): boolean {
  const cycleState = summary.currentCycle?.state;
  const obligationState = summary.currentObligation?.state;
  return (
    summary.journal.state === "active" &&
    summary.access.mode === "active" &&
    (cycleState === "awaiting_astrologer_response" ||
      cycleState === "awaiting_astrologer_closing_response") &&
    (obligationState === "open" || obligationState === "overdue")
  );
}
