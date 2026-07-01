import {
  dictionaryEntriesResponseSchema,
  type DictionaryEntriesQuery,
  type DictionaryEntriesResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listDictionaryEntries(
  query: DictionaryEntriesQuery
): Promise<DictionaryEntriesResponse> {
  const searchParams = new URLSearchParams({
    locale: query.locale,
    source: query.source,
    limit: String(query.limit),
    offset: String(query.offset)
  });
  const search = query.search?.trim();

  if (query.categoryId) {
    searchParams.set("categoryId", query.categoryId);
  }

  if (search) {
    searchParams.set("search", search);
  }

  return dictionaryEntriesResponseSchema.parse(
    await application.http.get(`/dictionary/entries?${searchParams.toString()}`)
  );
}
