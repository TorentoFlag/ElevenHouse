import {
  astroDiaryJournalListResponseSchema,
  type AstroDiaryJournalListResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listAstroDiaryJournals(): Promise<AstroDiaryJournalListResponse> {
  return astroDiaryJournalListResponseSchema.parse(
    await application.http.get("/astro-diary/journals")
  );
}
