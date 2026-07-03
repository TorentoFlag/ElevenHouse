import type { ProductResponse } from "@elevenhouse/contracts";
import { Card } from "@elevenhouse/design-system/components/Card";
import "@elevenhouse/design-system/components/Card.css";
import type { ProductCopy, ProductLocale } from "../../../features/products/model/productCopy";
import { createProductCardSummary } from "../../../features/products/model/productFormatting";
import styles from "../ProductsPage.module.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";

export type ProductCardProps = {
  readonly product: ProductResponse;
  readonly productCopy: ProductCopy;
  readonly locale: ProductLocale;
  readonly actions: ProductCardActions;
  readonly isActionPending: boolean;
};

export type ProductCardActions = {
  readonly editLabel: string;
  readonly duplicateLabel: string;
  readonly publishLabel: string;
  readonly draftLabel: string;
  readonly archiveLabel: string;
  readonly onEdit: (product: ProductResponse) => void;
  readonly onDuplicate: (productId: string) => void;
  readonly onStatusChange: (productId: string, status: ProductResponse["status"]) => void;
};

export function ProductCard({
  product,
  productCopy,
  locale,
  actions,
  isActionPending
}: ProductCardProps) {
  const summary = createProductCardSummary(product, productCopy, locale);

  return (
    <Card as="article" className={styles.productCard} padding="medium" variant="default">
      <div className={styles.productCardHeader}>
        <span className={styles.productTypeIcon} aria-hidden="true">
          <Icon iconName="check" width={17} height={17} />
        </span>
        <div className={styles.productHeading}>
          <span className={styles.productType}>{summary.typeLabel}</span>
          <h2 className={styles.productTitle}>{product.title}</h2>
        </div>
        <span className={`${styles.statusBadge} ${styles[`statusBadge-${summary.statusTone}`]}`}>
          {summary.statusLabel}
        </span>
      </div>

      <div className={styles.productPriceLine}>
        <span className={styles.productPrice}>{summary.price.amount}</span>
        {summary.price.suffix ? (
          <span className={styles.productPriceSuffix}>{summary.price.suffix}</span>
        ) : null}
      </div>
      <div className={styles.productMeta}>{summary.metaLine}</div>

      <ul className={styles.includedList}>
        {product.includedItems.slice(0, 4).map((item) => (
          <li key={item.id} className={styles.includedItem}>
            <Icon iconName="check" width={13} height={13} aria-hidden="true" />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>

      <div className={styles.productFooter}>
        <span>
          {summary.salesLabel} <strong>{summary.salesCount}</strong>
        </span>
        <span className={styles.revenue}>{summary.revenueLabel}</span>
        {summary.ratingLabel ? <span className={styles.rating}>{summary.ratingLabel}</span> : null}
        <span className={styles.productFooterSpacer} />
        <button
          type="button"
          className={styles.productActionButton}
          data-product-action-edit="true"
          aria-label={actions.editLabel}
          onClick={() => actions.onEdit(product)}
        >
          {actions.editLabel}
        </button>
        <button
          type="button"
          className={styles.productActionButton}
          data-product-action-duplicate="true"
          aria-label={actions.duplicateLabel}
          disabled={isActionPending}
          onClick={() => actions.onDuplicate(product.id)}
        >
          {actions.duplicateLabel}
        </button>
        {product.status === "draft" ? (
          <button
            type="button"
            className={styles.productActionButton}
            data-product-action-publish="true"
            aria-label={actions.publishLabel}
            disabled={isActionPending}
            onClick={() => actions.onStatusChange(product.id, "active")}
          >
            {actions.publishLabel}
          </button>
        ) : null}
        {product.status !== "draft" ? (
          <button
            type="button"
            className={styles.productActionButton}
            data-product-action-draft="true"
            aria-label={actions.draftLabel}
            disabled={isActionPending}
            onClick={() => actions.onStatusChange(product.id, "draft")}
          >
            {actions.draftLabel}
          </button>
        ) : null}
        {product.status !== "archived" ? (
          <button
            type="button"
            className={styles.productActionButton}
            data-product-action-archive="true"
            aria-label={actions.archiveLabel}
            disabled={isActionPending}
            onClick={() => actions.onStatusChange(product.id, "archived")}
          >
            {actions.archiveLabel}
          </button>
        ) : null}
      </div>
    </Card>
  );
}
