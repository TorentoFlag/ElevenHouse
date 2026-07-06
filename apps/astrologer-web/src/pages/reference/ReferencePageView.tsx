import type {
  DictionaryCategoryResponse,
  DictionaryEffectiveEntryResponse,
  DictionaryEntrySourceFilter,
  DictionarySourceCounts
} from "@elevenhouse/contracts";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { ReferenceCategoryRail } from "./components/ReferenceCategoryRail";
import { ReferenceConfirmationModal } from "./components/ReferenceConfirmationModal";
import { ReferenceResults } from "./components/ReferenceResults";
import { ReferenceToolbar } from "./components/ReferenceToolbar";
import type { ReferenceAddEntryOptions } from "./types";
import styles from "./ReferencePage.module.css";

type ReferencePageCopy = AstrologerCopy["reference"];

export type ReferencePageViewProps = {
  copy: ReferencePageCopy;
  catalogTotal: number;
  categories: DictionaryCategoryResponse[];
  entries: DictionaryEffectiveEntryResponse[];
  selectedCategoryId: string | null;
  selectedSource: DictionaryEntrySourceFilter;
  sourceCounts: DictionarySourceCounts;
  search: string;
  isLoading: boolean;
  isError: boolean;
  isResetting: boolean;
  isDeletingEntry: boolean;
  isResetConfirmationOpen: boolean;
  deleteConfirmationEntry: DictionaryEffectiveEntryResponse | null;
  resultsMotionKey: string;
  isResultsUpdating: boolean;
  hasMoreEntries: boolean;
  isLoadingMoreEntries: boolean;
  onCategoryChange: (categoryId: string | null) => void;
  onSourceChange: (source: DictionaryEntrySourceFilter) => void;
  onSearchChange: (search: string) => void;
  onReset: () => void;
  onResetConfirm: () => void;
  onResetCancel: () => void;
  onDeleteConfirm: () => void | Promise<void>;
  onDeleteCancel: () => void;
  onAdd: (options?: ReferenceAddEntryOptions) => void;
  onEditEntry: (entry: DictionaryEffectiveEntryResponse) => void;
  onDeleteEntry: (entry: DictionaryEffectiveEntryResponse) => void;
  onLoadMoreEntries: () => void;
};

export function ReferencePageView({
  copy,
  catalogTotal,
  categories,
  entries,
  selectedCategoryId,
  selectedSource,
  sourceCounts,
  search,
  isLoading,
  isError,
  isResetting,
  isDeletingEntry,
  isResetConfirmationOpen,
  deleteConfirmationEntry,
  resultsMotionKey,
  isResultsUpdating,
  hasMoreEntries,
  isLoadingMoreEntries,
  onCategoryChange,
  onSourceChange,
  onSearchChange,
  onReset,
  onResetConfirm,
  onResetCancel,
  onDeleteConfirm,
  onDeleteCancel,
  onAdd,
  onEditEntry,
  onDeleteEntry,
  onLoadMoreEntries
}: ReferencePageViewProps) {
  return (
    <section className={styles.referencePage} aria-labelledby="reference-title">
      <ReferenceToolbar
        title={copy.title}
        catalogTotal={catalogTotal}
        search={search}
        searchPlaceholder={copy.searchPlaceholder}
        resetLabel={copy.resetLabel}
        addLabel={copy.addLabel}
        isResetting={isResetting}
        onSearchChange={onSearchChange}
        onReset={onReset}
        onAdd={onAdd}
      />

      <div className={styles.body}>
        <ReferenceCategoryRail
          allCategoriesLabel={copy.allCategoriesLabel}
          catalogTotal={catalogTotal}
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onCategoryChange={onCategoryChange}
        />

        <ReferenceResults
          sourceFilterAriaLabel={copy.sourceFilterAriaLabel}
          sourceFilters={copy.sourceFilters}
          sourceCounts={sourceCounts}
          selectedSource={selectedSource}
          entries={entries}
          search={search}
          isLoading={isLoading}
          isError={isError}
          resultsMotionKey={resultsMotionKey}
          isResultsUpdating={isResultsUpdating}
          hasMoreEntries={hasMoreEntries}
          isLoadingMoreEntries={isLoadingMoreEntries}
          loadingLabel={copy.loadingLabel}
          errorLabel={copy.errorLabel}
          emptyLabel={copy.emptyLabel}
          emptyAddLabel={copy.emptyAddLabel}
          sourceBadges={copy.sourceBadges}
          entryActions={copy.entryActions}
          onSourceChange={onSourceChange}
          onAdd={onAdd}
          onEditEntry={onEditEntry}
          onDeleteEntry={onDeleteEntry}
          onLoadMoreEntries={onLoadMoreEntries}
        />
      </div>

      {isResetConfirmationOpen && (
        <ReferenceConfirmationModal
          title={copy.resetConfirmation.title}
          closeLabel={copy.resetConfirmation.closeLabel}
          description={copy.resetConfirmation.description}
          confirmLabel={copy.resetConfirmation.confirmLabel}
          cancelLabel={copy.resetConfirmation.cancelLabel}
          isPending={isResetting}
          actionDataAttribute="data-reference-reset-confirmation-action"
          onConfirm={onResetConfirm}
          onCancel={onResetCancel}
        />
      )}

      {deleteConfirmationEntry && (
        <ReferenceConfirmationModal
          title={copy.deleteConfirmation.title}
          closeLabel={copy.deleteConfirmation.closeLabel}
          description={copy.deleteConfirmation.description}
          confirmLabel={copy.deleteConfirmation.confirmLabel}
          cancelLabel={copy.deleteConfirmation.cancelLabel}
          isPending={isDeletingEntry}
          actionDataAttribute="data-reference-delete-confirmation-action"
          onConfirm={onDeleteConfirm}
          onCancel={onDeleteCancel}
        />
      )}
    </section>
  );
}
