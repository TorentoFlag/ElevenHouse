import {
  dictionaryCategoriesResponseSchema,
  type DictionaryCategoriesResponse,
  type ListDictionaryCategoriesQuery
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listDictionaryCategories(
  query: ListDictionaryCategoriesQuery
): Promise<DictionaryCategoriesResponse> {
  const searchParams = new URLSearchParams({ locale: query.locale });

  return dictionaryCategoriesResponseSchema.parse(
    await application.http.get(`/dictionary/categories?${searchParams.toString()}`)
  );
}
