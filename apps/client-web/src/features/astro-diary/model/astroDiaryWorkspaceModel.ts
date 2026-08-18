import type {
  AstroDiaryJournalSummaryResponse,
  AstroDiaryTimelineItem,
  AstroDiaryTimelinePage
} from "@elevenhouse/contracts";

export function resolveRelationshipJournalSelection(input: {
  readonly astrologerId: string;
  readonly requestedJournalId: string | undefined;
  readonly journals: readonly AstroDiaryJournalSummaryResponse[];
}): Readonly<{
  journals: readonly AstroDiaryJournalSummaryResponse[];
  selectedJournalId: string | undefined;
}> {
  const journals = input.journals.filter(
    ({ journal }) => journal.astrologerUserId === input.astrologerId
  );
  const requested = journals.find(({ journal }) => journal.id === input.requestedJournalId);
  const preferred = requested ?? journals.find(({ access }) => access.mode === "active") ?? journals[0];
  return { journals, selectedJournalId: preferred?.journal.id };
}

export function collectAstroDiaryTimelineItems(
  pages: readonly AstroDiaryTimelinePage[] | undefined
): readonly AstroDiaryTimelineItem[] {
  return pages?.flatMap(({ items }) => items) ?? [];
}

export function isClientEntryActionable(summary: AstroDiaryJournalSummaryResponse): boolean {
  return (
    summary.journal.state === "active" &&
    summary.access.mode === "active" &&
    summary.access.allowance.available > 0 &&
    summary.currentCycle === null
  );
}
