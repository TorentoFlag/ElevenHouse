import type {
  DictionaryEffectiveEntryResponse,
  DictionaryEntrySourceFilter,
  DictionarySourceCounts
} from "@elevenhouse/contracts";
import { classNames } from "@elevenhouse/design-system/helpers";
import { MotionContent } from "@elevenhouse/design-system/motion";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import type { ReferenceAddEntryOptions } from "../types";
import { ReferenceEntryCard } from "./ReferenceEntryCard";
import { ReferenceSourceFilterChip } from "./ReferenceSourceFilterChip";
import styles from "../ReferencePage.module.css";

type ReferenceCopy = AstrologerCopy["reference"];

export type ReferenceResultsProps = {
  readonly sourceFilterAriaLabel: string;
  readonly sourceFilters: ReferenceCopy["sourceFilters"];
  readonly sourceCounts: DictionarySourceCounts;
  readonly selectedSource: DictionaryEntrySourceFilter;
  readonly entries: DictionaryEffectiveEntryResponse[];
  readonly search: string;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly resultsMotionKey: string;
  readonly isResultsUpdating: boolean;
  readonly loadingLabel: string;
  readonly errorLabel: string;
  readonly emptyLabel: string;
  readonly emptyAddLabel: string;
  readonly sourceBadges: ReferenceCopy["sourceBadges"];
  readonly entryActions: ReferenceCopy["entryActions"];
  readonly onSourceChange: (source: DictionaryEntrySourceFilter) => void;
  readonly onAdd: (options?: ReferenceAddEntryOptions) => void;
  readonly onEditEntry: (entry: DictionaryEffectiveEntryResponse) => void;
  readonly onDeleteEntry: (entry: DictionaryEffectiveEntryResponse) => void;
};

const sourceFilterOrder: DictionaryEntrySourceFilter[] = ["all", "platform", "modified", "custom"];

export function ReferenceResults({
  sourceFilterAriaLabel,
  sourceFilters,
  sourceCounts,
  selectedSource,
  entries,
  search,
  isLoading,
  isError,
  resultsMotionKey,
  isResultsUpdating,
  loadingLabel,
  errorLabel,
  emptyLabel,
  emptyAddLabel,
  sourceBadges,
  entryActions,
  onSourceChange,
  onAdd,
  onEditEntry,
  onDeleteEntry
}: ReferenceResultsProps) {
  return (
    <div className={styles.content}>
      <div className={styles.sourceFilters} role="group" aria-label={sourceFilterAriaLabel}>
        {sourceFilterOrder.map((source) => (
          <ReferenceSourceFilterChip
            key={source}
            source={source}
            label={sourceFilters[source]}
            count={sourceCounts[source]}
            isActive={selectedSource === source}
            onClick={() => onSourceChange(source)}
          />
        ))}
      </div>

      <MotionContent
        className={classNames(
          styles.resultsMotion,
          isResultsUpdating ? styles.resultsMotionUpdating : undefined
        )}
        transitionKey={resultsMotionKey}
      >
        {isLoading && <p className={styles.contentState}>{loadingLabel}</p>}
        {isError && <p className={styles.contentState}>{errorLabel}</p>}
        {!isLoading && !isError && entries.length === 0 && (
          <div className={styles.emptyState}>
            <p>{emptyLabel}</p>
            <button
              className={`${styles.button} ${styles.buttonGhost}`}
              type="button"
              onClick={() => onAdd({ titleSeed: search })}
            >
              {emptyAddLabel}
            </button>
          </div>
        )}

        {!isLoading && !isError && entries.length > 0 && (
          <div className={styles.entryGrid}>
            {entries.map((entry) => (
              <ReferenceEntryCard
                key={entry.id}
                entry={entry}
                sourceBadges={sourceBadges}
                entryActions={entryActions}
                onEditEntry={onEditEntry}
                onDeleteEntry={onDeleteEntry}
              />
            ))}
          </div>
        )}
      </MotionContent>
    </div>
  );
}
