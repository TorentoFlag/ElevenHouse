import {
  dictionaryEntriesByCodesQuerySchema,
  dictionaryEntriesResponseSchema,
  type DictionaryEntriesByCodesQuery,
  type DictionaryEntriesResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listDictionaryEntriesByCodes(
  query: DictionaryEntriesByCodesQuery
): Promise<DictionaryEntriesResponse> {
  const parsedQuery = dictionaryEntriesByCodesQuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    locale: parsedQuery.locale,
    codes: parsedQuery.codes.join(",")
  });

  return dictionaryEntriesResponseSchema.parse(
    await application.http.get(`/dictionary/entries/by-codes?${searchParams.toString()}`)
  );
}
