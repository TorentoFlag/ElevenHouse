import type { AstroDiaryJournalListResponse } from "@elevenhouse/contracts";

export type AstroDiaryJournalReaderListInput = Readonly<{
  astrologerUserId: string;
  limit: number;
  now: string;
}>;

export type AstroDiaryJournalReader = Readonly<{
  listAstrologerJournals(
    input: AstroDiaryJournalReaderListInput
  ): Promise<AstroDiaryJournalListResponse>;
}>;
