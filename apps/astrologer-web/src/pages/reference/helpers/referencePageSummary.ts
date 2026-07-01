import type {
  DictionaryCategoriesResponse,
  DictionaryEntriesResponse,
  DictionarySourceCounts
} from "@elevenhouse/contracts";

const emptySourceCounts = {
  all: 0,
  platform: 0,
  modified: 0,
  custom: 0
} satisfies DictionarySourceCounts;

export function createReferencePageSummary({
  categoriesResponse,
  entriesResponse
}: {
  categoriesResponse?: DictionaryCategoriesResponse;
  entriesResponse?: DictionaryEntriesResponse;
}) {
  return {
    categories: categoriesResponse?.categories ?? [],
    entries: entriesResponse?.entries ?? [],
    total: entriesResponse?.total ?? 0,
    sourceCounts: entriesResponse?.counts.sources ?? emptySourceCounts
  };
}
