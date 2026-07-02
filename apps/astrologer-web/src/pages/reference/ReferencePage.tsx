import { useRef, useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type { DictionaryEntrySourceFilter } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useDictionaryCategoriesQuery } from "../../features/dictionary/model/useDictionaryCategoriesQuery";
import { useDictionaryEntriesQuery } from "../../features/dictionary/model/useDictionaryEntriesQuery";
import { useResetDictionaryEntriesMutation } from "../../features/dictionary/model/useResetDictionaryEntriesMutation";
import { ReferenceEntryModal } from "./components/ReferenceEntryModal";
import { createReferenceEntriesQuery } from "./helpers/referenceEntriesQuery";
import { createReferencePageSummary } from "./helpers/referencePageSummary";
import { ReferencePageView, type ReferenceAddEntryOptions } from "./ReferencePageView";

type ReferenceEntryModalState = {
  readonly titleSeed: string;
};

export function ReferencePage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<DictionaryEntrySourceFilter>("all");
  const [search, setSearch] = useState("");
  const [entryModal, setEntryModal] = useState<ReferenceEntryModalState | null>(null);
  const [isResetConfirmationOpen, setIsResetConfirmationOpen] = useState(false);
  const categoriesQuery = useDictionaryCategoriesQuery({ locale });
  const resetEntriesMutation = useResetDictionaryEntriesMutation();
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
  const previousResultsMotionKeyRef = useRef("initial");
  const currentResultsMotionKey =
    entriesQuery.isPlaceholderData && previousResultsMotionKeyRef.current
      ? previousResultsMotionKeyRef.current
      : `${selectedCategoryId ?? "all"}:${selectedSource}:${search.trim()}:${entriesQuery.dataUpdatedAt}`;

  previousResultsMotionKeyRef.current = currentResultsMotionKey;

  useDocumentTitle(dictionary.reference.documentTitle);

  const openEntryModal = (options: ReferenceAddEntryOptions = {}) => {
    setEntryModal({
      titleSeed: options.titleSeed ?? ""
    });
  };

  return (
    <>
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
        isResetting={resetEntriesMutation.isPending}
        isResetConfirmationOpen={isResetConfirmationOpen}
        resultsMotionKey={currentResultsMotionKey}
        isResultsUpdating={entriesQuery.isPlaceholderData && entriesQuery.isFetching}
        onCategoryChange={setSelectedCategoryId}
        onSourceChange={setSelectedSource}
        onSearchChange={setSearch}
        onReset={() => setIsResetConfirmationOpen(true)}
        onResetCancel={() => {
          if (resetEntriesMutation.isPending) {
            return;
          }

          setIsResetConfirmationOpen(false);
        }}
        onResetConfirm={() => {
          if (resetEntriesMutation.isPending) {
            return;
          }

          resetEntriesMutation
            .mutateAsync()
            .then(() => {
              setSelectedCategoryId(null);
              setSelectedSource("all");
              setSearch("");
              setIsResetConfirmationOpen(false);
            })
            .catch(() => undefined);
        }}
        onAdd={openEntryModal}
        onEditEntry={() => undefined}
        onDeleteEntry={() => undefined}
      />
      {entryModal && (
        <ReferenceEntryModal
          copy={dictionary.reference.entryModal}
          categories={summary.categories}
          locale={locale}
          selectedCategoryId={selectedCategoryId}
          titleSeed={entryModal.titleSeed}
          onClose={() => setEntryModal(null)}
        />
      )}
    </>
  );
}
