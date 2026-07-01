import type {
  DictionaryEntriesQuery,
  DictionaryEntrySourceFilter
} from "@elevenhouse/contracts";

export type CreateReferenceEntriesQueryInput = {
  readonly locale: DictionaryEntriesQuery["locale"];
  readonly selectedCategoryId: string | null;
  readonly selectedSource: DictionaryEntrySourceFilter;
  readonly search: string;
};

export function createReferenceEntriesQuery({
  locale,
  selectedCategoryId,
  selectedSource,
  search
}: CreateReferenceEntriesQueryInput): DictionaryEntriesQuery {
  const normalizedSearch = search.trim();

  return {
    locale,
    ...(selectedCategoryId ? { categoryId: selectedCategoryId } : {}),
    source: selectedSource,
    ...(normalizedSearch ? { search: normalizedSearch } : {}),
    limit: 50,
    offset: 0
  };
}
