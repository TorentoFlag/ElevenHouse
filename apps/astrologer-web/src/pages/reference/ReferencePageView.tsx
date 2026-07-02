import type {
  DictionaryCategoryResponse,
  DictionaryEffectiveEntryResponse,
  DictionaryEntrySourceFilter,
  DictionarySourceCounts
} from "@elevenhouse/contracts";
import type { ComponentType, SVGProps } from "react";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Card } from "@elevenhouse/design-system/components/Card";
import "@elevenhouse/design-system/components/Card.css";
import { IconButton } from "@elevenhouse/design-system/components/IconButton";
import "@elevenhouse/design-system/components/IconButton.css";
import { classNames } from "@elevenhouse/design-system/helpers";
import { Content } from "@elevenhouse/design-system/icons/Content";
import { Edit } from "@elevenhouse/design-system/icons/Edit";
import { Flow } from "@elevenhouse/design-system/icons/Flow";
import { LayoutGrid } from "@elevenhouse/design-system/icons/LayoutGrid";
import { Orbit } from "@elevenhouse/design-system/icons/Orbit";
import { Plus } from "@elevenhouse/design-system/icons/Plus";
import { Reference } from "@elevenhouse/design-system/icons/Reference";
import { Search } from "@elevenhouse/design-system/icons/Search";
import { Sparkle } from "@elevenhouse/design-system/icons/Sparkle";
import { Trash } from "@elevenhouse/design-system/icons/Trash";
import { MotionContent } from "@elevenhouse/design-system/motion";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { ReferenceCategoryButton } from "./components/ReferenceCategoryButton";
import { ReferenceSourceFilterChip } from "./components/ReferenceSourceFilterChip";
import styles from "./ReferencePage.module.css";

type ReferencePageCopy = AstrologerCopy["reference"];

export type ReferenceAddEntryOptions = {
  readonly titleSeed?: string;
};

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
  resultsMotionKey: string;
  isResultsUpdating: boolean;
  onCategoryChange: (categoryId: string | null) => void;
  onSourceChange: (source: DictionaryEntrySourceFilter) => void;
  onSearchChange: (search: string) => void;
  onReset: () => void;
  onAdd: (options?: ReferenceAddEntryOptions) => void;
  onEditEntry: (entry: DictionaryEffectiveEntryResponse) => void;
  onDeleteEntry: (entry: DictionaryEffectiveEntryResponse) => void;
};

type ReferenceIcon = ComponentType<SVGProps<SVGSVGElement>>;

const categoryIconByCode: Record<string, ReferenceIcon> = {
  planets_in_signs: Orbit,
  signs: Orbit,
  planets_in_houses: Content,
  houses: Content,
  aspects: Flow,
  house_meanings: LayoutGrid,
  "house-mean": LayoutGrid,
  own: Sparkle,
  custom: Sparkle
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
  resultsMotionKey,
  isResultsUpdating,
  onCategoryChange,
  onSourceChange,
  onSearchChange,
  onReset,
  onAdd,
  onEditEntry,
  onDeleteEntry
}: ReferencePageViewProps) {
  const sourceFilters: DictionaryEntrySourceFilter[] = ["all", "platform", "modified", "custom"];

  return (
    <section className={styles.referencePage} aria-labelledby="reference-title">
      <header className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <span className={styles.titleIcon} aria-hidden="true">
            <Reference width={18} height={18} />
          </span>
          <span className={styles.titleText}>
            <h1 id="reference-title" className={styles.title}>
              {copy.title}
            </h1>
            <span className={styles.total}>{catalogTotal}</span>
          </span>
        </div>

        <label className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden="true">
            <Search width={15} height={15} />
          </span>
          <input
            className={styles.searchInput}
            type="search"
            value={search}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
        </label>

        <span className={styles.toolbarSpacer} aria-hidden="true" />

        <Button
          className={styles.resetButton}
          type="button"
          variant="default"
          size="medium"
          title={copy.resetLabel}
          disabled={isResetting}
          data-reference-toolbar-action="reset"
          onClick={onReset}
        />
        <Button
          className={styles.addButton}
          type="button"
          variant="brand"
          size="big"
          title={copy.addLabel}
          startIcon={<Plus width={15} height={15} aria-hidden="true" />}
          data-reference-toolbar-action="add"
          onClick={() => onAdd()}
        />
      </header>

      <div className={styles.body}>
        <aside className={styles.categoryRail} aria-label={copy.allCategoriesLabel}>
          <nav className={styles.categoryList}>
            <ReferenceCategoryButton
              id="all"
              label={copy.allCategoriesLabel}
              count={catalogTotal}
              icon={<Reference width={16} height={16} />}
              isActive={selectedCategoryId === null}
              onClick={() => onCategoryChange(null)}
            />

            {categories.map((category) => {
              const CategoryIcon = categoryIconByCode[category.code] ?? Reference;

              return (
                <ReferenceCategoryButton
                  key={category.id}
                  id={category.id}
                  label={category.name}
                  count={category.count}
                  icon={<CategoryIcon width={16} height={16} />}
                  isActive={selectedCategoryId === category.id}
                  onClick={() => onCategoryChange(category.id)}
                />
              );
            })}
          </nav>
        </aside>

        <div className={styles.content}>
          <div
            className={styles.sourceFilters}
            role="group"
            aria-label={copy.sourceFilterAriaLabel}
          >
            {sourceFilters.map((source) => (
              <ReferenceSourceFilterChip
                key={source}
                source={source}
                label={copy.sourceFilters[source]}
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
            {isLoading && <p className={styles.contentState}>{copy.loadingLabel}</p>}
            {isError && <p className={styles.contentState}>{copy.errorLabel}</p>}
            {!isLoading && !isError && entries.length === 0 && (
              <div className={styles.emptyState}>
                <p>{copy.emptyLabel}</p>
                <button
                  className={`${styles.button} ${styles.buttonGhost}`}
                  type="button"
                  onClick={() => onAdd({ titleSeed: search })}
                >
                  {copy.emptyAddLabel}
                </button>
              </div>
            )}

            {!isLoading && !isError && entries.length > 0 && (
              <div className={styles.entryGrid}>
                {entries.map((entry) => (
                  <Card
                    as="article"
                    className={styles.entryCard}
                    key={entry.id}
                    padding="medium"
                    variant="elevated"
                  >
                    <div className={styles.entryTitleRow}>
                      <h2 className={styles.entryTitle}>{entry.title}</h2>
                      <span className={styles.entryBadge}>{copy.sourceBadges[entry.source]}</span>
                    </div>
                    <p className={styles.entryContent}>{entry.content}</p>
                    <div className={styles.entryActions}>
                      <Button
                        className={styles.entryEditButton}
                        type="button"
                        variant="glass"
                        size="small"
                        title={copy.entryActions.editLabel}
                        startIcon={
                          <Edit
                            className={styles.buttonIcon}
                            width={13}
                            height={13}
                            aria-hidden="true"
                          />
                        }
                        data-reference-entry-action="edit"
                        onClick={() => onEditEntry(entry)}
                      />
                      <IconButton
                        type="button"
                        variant="quiet"
                        size="small"
                        label={`${copy.entryActions.deleteLabel}: ${entry.title}`}
                        icon={<Trash aria-hidden="true" />}
                        data-reference-entry-action="delete"
                        onClick={() => onDeleteEntry(entry)}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </MotionContent>
        </div>
      </div>
    </section>
  );
}
