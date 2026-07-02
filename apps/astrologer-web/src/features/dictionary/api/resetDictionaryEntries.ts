import { application } from "../../../Application";

export async function resetDictionaryEntries(): Promise<void> {
  await application.http.delete("/dictionary/entries", { csrf: true });
}
