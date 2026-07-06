import type { DictionaryEntrySourceFilter } from "@elevenhouse/contracts";
import type { DictionaryEntriesInfiniteQuery } from "../../../features/dictionary/model/dictionaryQueryKeys";

export type CreateReferenceEntriesQueryInput = {
  readonly locale: DictionaryEntriesInfiniteQuery["locale"];
  readonly selectedCategoryId: string | null;
  readonly selectedSource: DictionaryEntrySourceFilter;
  readonly search: string;
};

export function createReferenceEntriesQuery({
  locale,
  selectedCategoryId,
  selectedSource,
  search
}: CreateReferenceEntriesQueryInput): DictionaryEntriesInfiniteQuery {
  const normalizedSearch = search.trim();

  return {
    locale,
    ...(selectedCategoryId ? { categoryId: selectedCategoryId } : {}),
    source: selectedSource,
    ...(normalizedSearch ? { search: normalizedSearch } : {}),
    limit: 10
  };
}
