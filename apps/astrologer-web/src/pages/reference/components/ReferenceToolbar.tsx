import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Plus } from "@elevenhouse/design-system/icons/Plus";
import { Reference } from "@elevenhouse/design-system/icons/Reference";
import { Search } from "@elevenhouse/design-system/icons/Search";
import type { ReferenceAddEntryOptions } from "../types";
import styles from "../ReferencePage.module.css";

export type ReferenceToolbarProps = {
  readonly title: string;
  readonly catalogTotal: number;
  readonly search: string;
  readonly searchPlaceholder: string;
  readonly resetLabel: string;
  readonly addLabel: string;
  readonly isResetting: boolean;
  readonly onSearchChange: (search: string) => void;
  readonly onReset: () => void;
  readonly onAdd: (options?: ReferenceAddEntryOptions) => void;
};

export function ReferenceToolbar({
  title,
  catalogTotal,
  search,
  searchPlaceholder,
  resetLabel,
  addLabel,
  isResetting,
  onSearchChange,
  onReset,
  onAdd
}: ReferenceToolbarProps) {
  return (
    <header className={styles.toolbar}>
      <div className={styles.titleGroup}>
        <span className={styles.titleIcon} aria-hidden="true">
          <Reference width={18} height={18} />
        </span>
        <span className={styles.titleText}>
          <h1 id="reference-title" className={styles.title}>
            {title}
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
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
      </label>

      <span className={styles.toolbarSpacer} aria-hidden="true" />

      <Button
        className={styles.resetButton}
        type="button"
        variant="default"
        size="medium"
        title={resetLabel}
        disabled={isResetting}
        data-reference-toolbar-action="reset"
        onClick={onReset}
      />
      <Button
        className={styles.addButton}
        type="button"
        variant="brand"
        size="big"
        title={addLabel}
        startIcon={<Plus width={15} height={15} aria-hidden="true" />}
        data-reference-toolbar-action="add"
        onClick={() => onAdd()}
      />
    </header>
  );
}
