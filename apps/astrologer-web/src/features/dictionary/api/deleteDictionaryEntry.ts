import { application } from "../../../Application";

export async function deleteDictionaryEntry(entryId: string): Promise<void> {
  await application.http.delete(`/dictionary/entries/${entryId}`, { csrf: true });
}
