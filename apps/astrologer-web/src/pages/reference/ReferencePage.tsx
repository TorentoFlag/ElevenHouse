import { useRef, useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type {
  DictionaryEffectiveEntryResponse,
  DictionaryEntrySourceFilter
} from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useDictionaryCategoriesQuery } from "../../features/dictionary/model/useDictionaryCategoriesQuery";
import { useDictionaryEntriesQuery } from "../../features/dictionary/model/useDictionaryEntriesQuery";
import { useDeleteDictionaryEntryMutation } from "../../features/dictionary/model/useDeleteDictionaryEntryMutation";
import { useResetDictionaryEntriesMutation } from "../../features/dictionary/model/useResetDictionaryEntriesMutation";
import { ReferenceEntryModal } from "./components/ReferenceEntryModal";
import { createReferenceEntriesQuery } from "./helpers/referenceEntriesQuery";
import { createReferencePageSummary } from "./helpers/referencePageSummary";
import { ReferencePageView, type ReferenceAddEntryOptions } from "./ReferencePageView";

type ReferenceEntryModalState =
  | {
      readonly mode: "create";
      readonly titleSeed: string;
    }
  | {
      readonly mode: "edit";
      readonly entry: DictionaryEffectiveEntryResponse;
    };

export function ReferencePage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<DictionaryEntrySourceFilter>("all");
  const [search, setSearch] = useState("");
  const [entryModal, setEntryModal] = useState<ReferenceEntryModalState | null>(null);
  const [deleteConfirmationEntry, setDeleteConfirmationEntry] =
    useState<DictionaryEffectiveEntryResponse | null>(null);
  const [isResetConfirmationOpen, setIsResetConfirmationOpen] = useState(false);
  const categoriesQuery = useDictionaryCategoriesQuery({ locale });
  const deleteEntryMutation = useDeleteDictionaryEntryMutation();
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
      mode: "create",
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
        isDeletingEntry={deleteEntryMutation.isPending}
        isResetConfirmationOpen={isResetConfirmationOpen}
        deleteConfirmationEntry={deleteConfirmationEntry}
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
        onDeleteCancel={() => {
          if (deleteEntryMutation.isPending) {
            return;
          }

          setDeleteConfirmationEntry(null);
        }}
        onDeleteConfirm={() => {
          if (deleteEntryMutation.isPending || !deleteConfirmationEntry?.astrologerEntryId) {
            return Promise.resolve();
          }

          return deleteEntryMutation
            .mutateAsync(deleteConfirmationEntry.astrologerEntryId)
            .then(() => {
              setDeleteConfirmationEntry(null);
            })
            .catch(() => undefined);
        }}
        onAdd={openEntryModal}
        onEditEntry={(entry) =>
          setEntryModal({
            mode: "edit",
            entry
          })
        }
        onDeleteEntry={(entry) => {
          if (!entry.astrologerEntryId) {
            return;
          }

          setDeleteConfirmationEntry(entry);
        }}
      />
      {entryModal && entryModal.mode === "create" && (
        <ReferenceEntryModal
          key={`create:${selectedCategoryId ?? "all"}:${entryModal.titleSeed}`}
          mode="create"
          copy={dictionary.reference.entryModal}
          categories={summary.categories}
          locale={locale}
          selectedCategoryId={selectedCategoryId}
          titleSeed={entryModal.titleSeed}
          onClose={() => setEntryModal(null)}
        />
      )}
      {entryModal && entryModal.mode === "edit" && (
        <ReferenceEntryModal
          key={`edit:${entryModal.entry.id}`}
          mode="edit"
          copy={dictionary.reference.entryModal}
          categories={summary.categories}
          locale={locale}
          entry={entryModal.entry}
          onClose={() => setEntryModal(null)}
        />
      )}
    </>
  );
}
