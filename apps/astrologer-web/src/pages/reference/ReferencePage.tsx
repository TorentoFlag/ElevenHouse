import { useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type { DictionaryEntrySourceFilter } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useDictionaryCategoriesQuery } from "../../features/dictionary/model/useDictionaryCategoriesQuery";
import { useDictionaryEntriesQuery } from "../../features/dictionary/model/useDictionaryEntriesQuery";
import { createReferenceEntriesQuery } from "./helpers/referenceEntriesQuery";
import { createReferencePageSummary } from "./helpers/referencePageSummary";
import { ReferencePageView } from "./ReferencePageView";

export function ReferencePage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<DictionaryEntrySourceFilter>("all");
  const [search, setSearch] = useState("");
  const categoriesQuery = useDictionaryCategoriesQuery({ locale });
  const entriesQuery = useDictionaryEntriesQuery(
    createReferenceEntriesQuery({
      locale,
      selectedCategoryId,
      selectedSource,
      search
    })
  );
  const summary = createReferencePageSummary({
    categoriesResponse: categoriesQuery.data,
    entriesResponse: entriesQuery.data
  });

  useDocumentTitle(dictionary.reference.documentTitle);

  return (
    <ReferencePageView
      copy={dictionary.reference}
      categories={summary.categories}
      entries={summary.entries}
      catalogTotal={summary.catalogTotal}
      sourceCounts={summary.sourceCounts}
      selectedCategoryId={selectedCategoryId}
      selectedSource={selectedSource}
      search={search}
      isLoading={categoriesQuery.isLoading || entriesQuery.isLoading}
      isError={categoriesQuery.isError || entriesQuery.isError}
      onCategoryChange={setSelectedCategoryId}
      onSourceChange={setSelectedSource}
      onSearchChange={setSearch}
      onReset={() => {
        setSelectedCategoryId(null);
        setSelectedSource("all");
        setSearch("");
      }}
      onAdd={() => undefined}
      onEditEntry={() => undefined}
      onDeleteEntry={() => undefined}
    />
  );
}
