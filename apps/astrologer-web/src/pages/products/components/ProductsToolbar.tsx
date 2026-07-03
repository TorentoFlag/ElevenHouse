import type { ListProductsResponse, ProductStatusFilter } from "@elevenhouse/contracts";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Chip } from "@elevenhouse/design-system/components/Chip";
import "@elevenhouse/design-system/components/Chip.css";
import { Box } from "@elevenhouse/design-system/icons/Box";
import { Plus } from "@elevenhouse/design-system/icons/Plus";
import styles from "../ProductsPage.module.css";

export type ProductsToolbarProps = {
  readonly title: string;
  readonly total: number;
  readonly statusFilterAriaLabel: string;
  readonly createLabel: string;
  readonly counts: ListProductsResponse["counts"];
  readonly selectedStatus: ProductStatusFilter;
  readonly statusFilters: Record<ProductStatusFilter, string>;
  readonly onStatusChange: (status: ProductStatusFilter) => void;
  readonly onCreate: () => void;
};

const statusFilterOrder: ProductStatusFilter[] = ["all", "active", "draft", "archived"];

export function ProductsToolbar({
  title,
  total,
  statusFilterAriaLabel,
  createLabel,
  counts,
  selectedStatus,
  statusFilters,
  onStatusChange,
  onCreate
}: ProductsToolbarProps) {
  return (
    <header className={styles.toolbar}>
      <div className={styles.titleGroup}>
        <span className={styles.titleIcon} aria-hidden="true">
          <Box width={18} height={18} />
        </span>
        <span className={styles.titleText}>
          <h1 id="products-title" className={styles.title}>
            {title}
          </h1>
          <span className={styles.total}>{total}</span>
        </span>
      </div>

      <div className={styles.statusFilters} role="group" aria-label={statusFilterAriaLabel}>
        {statusFilterOrder.map((status) => (
          <Chip
            key={status}
            label={statusFilters[status]}
            count={counts[status]}
            active={selectedStatus === status}
            onClick={() => onStatusChange(status)}
          />
        ))}
      </div>

      <span className={styles.toolbarSpacer} aria-hidden="true" />

      <Button
        className={styles.createButton}
        type="button"
        variant="brand"
        size="big"
        title={createLabel}
        startIcon={<Plus width={15} height={15} aria-hidden="true" />}
        onClick={onCreate}
      />
    </header>
  );
}
