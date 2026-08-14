import type { AstroDiaryJournalListResponse, AstroDiaryTimelinePage } from "@elevenhouse/contracts";

export type AstroDiaryJournalReaderListInput = Readonly<{
  astrologerUserId: string;
  limit: number;
  now: string;
}>;

export type AstroDiaryTimelineReaderInput = Readonly<{
  astrologerUserId: string;
  journalId: string;
  afterCursor: number;
  limit: number;
}>;

export type AstroDiaryJournalReader = Readonly<{
  listAstrologerJournals(
    input: AstroDiaryJournalReaderListInput
  ): Promise<AstroDiaryJournalListResponse>;
  getJournalTimeline(input: AstroDiaryTimelineReaderInput): Promise<AstroDiaryTimelinePage | null>;
}>;
