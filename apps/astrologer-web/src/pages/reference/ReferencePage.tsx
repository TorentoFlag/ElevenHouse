import { useRef, useState } from "react";
import { useI18n } from "@elevenhouse/i18n";
import type {
  DictionaryEffectiveEntryResponse,
  DictionaryEntrySourceFilter
} from "@elevenhouse/contracts";
import { useDebounce } from "../../common/hooks/useDebounce";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useDictionaryCategoriesQuery } from "../../features/dictionary/model/useDictionaryCategoriesQuery";
import { useDictionaryEntriesInfiniteQuery } from "../../features/dictionary/model/useDictionaryEntriesInfiniteQuery";
import { useDeleteDictionaryEntryMutation } from "../../features/dictionary/model/useDeleteDictionaryEntryMutation";
import { useResetDictionaryEntriesMutation } from "../../features/dictionary/model/useResetDictionaryEntriesMutation";
import { ReferenceEntryModal } from "./components/ReferenceEntryModal";
import { createReferenceEntriesQuery } from "./helpers/referenceEntriesQuery";
import { createReferencePageSummary } from "./helpers/referencePageSummary";
import { ReferencePageView } from "./ReferencePageView";
import type { ReferenceAddEntryOptions } from "./types";

type ReferenceEntryModalState =
  | {
      readonly mode: "create";
      readonly codeSeed: string | null;
      readonly titleSeed: string;
    }
  | {
      readonly mode: "edit";
      readonly entry: DictionaryEffectiveEntryResponse;
    };

export function ReferencePage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const referenceCreateIntent = getReferenceCreateIntent();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<DictionaryEntrySourceFilter>("all");
  const [search, setSearch] = useState(referenceCreateIntent?.searchSeed ?? "");
  const [entryModal, setEntryModal] = useState<ReferenceEntryModalState | null>(() =>
    referenceCreateIntent
      ? {
          mode: "create",
          codeSeed: referenceCreateIntent.codeSeed,
          titleSeed: referenceCreateIntent.titleSeed
        }
      : null
  );
  const [deleteConfirmationEntry, setDeleteConfirmationEntry] =
    useState<DictionaryEffectiveEntryResponse | null>(null);
  const [isResetConfirmationOpen, setIsResetConfirmationOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 700);
  const categoriesQuery = useDictionaryCategoriesQuery({ locale });
  const deleteEntryMutation = useDeleteDictionaryEntryMutation();
  const resetEntriesMutation = useResetDictionaryEntriesMutation();
  const entriesQuery = useDictionaryEntriesInfiniteQuery(
    createReferenceEntriesQuery({
      locale,
      selectedCategoryId,
      selectedSource,
      search: debouncedSearch
    })
  );
  const entryPages = entriesQuery.data?.pages ?? [];
  const firstEntryPage = entryPages[0];
  const entriesResponse = firstEntryPage
    ? {
        ...firstEntryPage,
        entries: entryPages.flatMap((page) => page.entries)
      }
    : undefined;
  const summary = createReferencePageSummary({
    categoriesResponse: categoriesQuery.data,
    entriesResponse
  });
  const referenceCreateCategoryId = referenceCreateIntent?.categoryCode
    ? getReferenceCategoryIdByCode(summary.categories, referenceCreateIntent.categoryCode)
    : null;
  const createSelectedCategoryId = referenceCreateCategoryId ?? selectedCategoryId;
  const isResultsUpdating =
    entriesQuery.isPlaceholderData && entriesQuery.isFetching && !entriesQuery.isFetchingNextPage;
  const previousResultsMotionKeyRef = useRef("initial");
  const currentResultsMotionKey =
    isResultsUpdating && previousResultsMotionKeyRef.current
      ? previousResultsMotionKeyRef.current
      : `${selectedCategoryId ?? "all"}:${selectedSource}:${debouncedSearch.trim()}:${entriesQuery.dataUpdatedAt}`;

  previousResultsMotionKeyRef.current = currentResultsMotionKey;

  useDocumentTitle(dictionary.reference.documentTitle);

  const openEntryModal = (options: ReferenceAddEntryOptions = {}) => {
    setEntryModal({
      mode: "create",
      codeSeed: options.codeSeed ?? null,
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
        isResultsUpdating={isResultsUpdating}
        hasMoreEntries={Boolean(entriesQuery.hasNextPage)}
        isLoadingMoreEntries={entriesQuery.isFetchingNextPage}
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
        onLoadMoreEntries={() => {
          if (entriesQuery.hasNextPage && !entriesQuery.isFetchingNextPage) {
            void entriesQuery.fetchNextPage();
          }
        }}
      />
      {entryModal && entryModal.mode === "create" && (
        <ReferenceEntryModal
          key={`create:${createSelectedCategoryId ?? "all"}:${entryModal.titleSeed}`}
          mode="create"
          copy={dictionary.reference.entryModal}
          categories={summary.categories}
          locale={locale}
          selectedCategoryId={createSelectedCategoryId}
          codeSeed={entryModal.codeSeed}
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

function getReferenceCreateIntent(): {
  readonly categoryCode: string | null;
  readonly codeSeed: string | null;
  readonly searchSeed: string;
  readonly titleSeed: string;
} | null {
  const searchParams = new URLSearchParams(getCurrentLocationSearch());
  const createCode = searchParams.get("create")?.trim();

  if (!createCode) {
    return null;
  }

  const searchSeed = searchParams.get("search")?.trim() || createCode;
  const titleSeed = searchParams.get("title")?.trim() || searchSeed;

  return {
    categoryCode: searchParams.get("category")?.trim() || null,
    codeSeed: createCode,
    searchSeed,
    titleSeed
  };
}

function getReferenceCategoryIdByCode(
  categories: readonly { readonly code: string; readonly id: string }[],
  categoryCode: string
): string | null {
  return categories.find((category) => category.code === categoryCode)?.id ?? null;
}

function getCurrentLocationSearch(): string {
  return typeof globalThis.location?.search === "string" ? globalThis.location.search : "";
}
