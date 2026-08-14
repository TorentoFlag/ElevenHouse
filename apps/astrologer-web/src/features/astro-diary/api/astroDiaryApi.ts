import {
  astroDiaryJournalListResponseSchema,
  astroDiaryTimelinePageSchema,
  type AstroDiaryTimelinePage,
  type AstroDiaryJournalListResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listAstroDiaryJournals(): Promise<AstroDiaryJournalListResponse> {
  return astroDiaryJournalListResponseSchema.parse(
    await application.http.get("/astro-diary/journals")
  );
}

export type GetAstroDiaryTimelineInput = Readonly<{
  journalId: string;
  afterCursor: number;
  limit: number;
}>;

export async function getAstroDiaryTimeline(
  input: GetAstroDiaryTimelineInput
): Promise<AstroDiaryTimelinePage> {
  const searchParams = new URLSearchParams({
    afterCursor: String(input.afterCursor),
    limit: String(input.limit)
  });

  return astroDiaryTimelinePageSchema.parse(
    await application.http.get(
      `/astro-diary/journals/${encodeURIComponent(input.journalId)}/timeline?${searchParams.toString()}`
    )
  );
}
