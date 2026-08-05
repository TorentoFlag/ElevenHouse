import type { ProductResponse } from "@elevenhouse/contracts";
import { ActionMenu, type ActionMenuItem } from "@elevenhouse/design-system/components/ActionMenu";
import "@elevenhouse/design-system/components/ActionMenu.css";
import { Card } from "@elevenhouse/design-system/components/Card";
import "@elevenhouse/design-system/components/Card.css";
import { classNames } from "@elevenhouse/design-system/helpers";
import type { ProductCopy, ProductLocale } from "../../../features/products/model/productCopy";
import {
  getProductCardActionItems,
  type ProductCardActionItem,
  type ProductCardActionLabels
} from "../../../features/products/model/productCardActions";
import { createProductCardSummary } from "../../../features/products/model/productFormatting";
import {
  getProductTypeIconName,
  resolveProductIconName
} from "../../../features/products/model/productIcons";
import styles from "../ProductsPage.module.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";

export type ProductCardProps = {
  readonly product: ProductResponse;
  readonly productCopy: ProductCopy;
  readonly locale: ProductLocale;
  readonly actions: ProductCardActions;
  readonly isActionPending: boolean;
  readonly canManageProducts?: boolean;
};

export type ProductCardActions = ProductCardActionLabels & {
  readonly onEdit: (product: ProductResponse) => void;
  readonly onDuplicate: (product: ProductResponse) => void;
  readonly onStatusChange: (productId: string, status: ProductResponse["status"]) => void;
};

export function ProductCard({
  product,
  productCopy,
  locale,
  actions,
  isActionPending,
  canManageProducts = true
}: ProductCardProps) {
  const summary = createProductCardSummary(product, productCopy, locale);

  return (
    <Card as="article" className={styles.productCard} padding="medium" variant="default">
      {product.coverMedia ? (
        <img
          className={styles.productCardCover}
          src={product.coverMedia.url}
          alt=""
          loading="lazy"
        />
      ) : null}
      <div className={styles.productCardHeader}>
        <span className={styles.productTypeIcon} aria-hidden="true">
          <Icon iconName={getProductTypeIconName(product.type)} width={20} height={20} />
        </span>
        <div className={styles.productHeading}>
          <span className={styles.productType}>{summary.typeLabel}</span>
          <h2 className={styles.productTitle}>{product.title}</h2>
        </div>
        <ProductStatusBadge label={summary.statusLabel} tone={summary.statusTone} />
      </div>

      <div className={styles.productPriceLine}>
        <span className={styles.productPrice}>{summary.price.amount}</span>
        {summary.price.suffix ? (
          <span className={styles.productPriceSuffix}>{summary.price.suffix}</span>
        ) : null}
        {summary.metaLine ? <span className={styles.productMeta}>· {summary.metaLine}</span> : null}
      </div>

      <ProductIncludedItemsList items={product.includedItems} />

      <div className={styles.productFooter}>
        <span className={styles.productFooterMeta}>
          <span>
            {summary.salesLabel} <strong>{summary.salesCount}</strong>
          </span>
          <span className={styles.revenue}>{summary.revenueLabel}</span>
          {summary.ratingLabel ? (
            <span className={styles.rating}>
              <Icon iconName="star" width={12} height={12} aria-hidden="true" />
              {summary.ratingLabel}
            </span>
          ) : null}
        </span>
        <span className={styles.productFooterSpacer} />
        {canManageProducts ? (
          <>
            <ActionMenu
              className={styles.productSecondaryActionsMenu}
              label={<Icon iconName="dots" width={15} height={15} aria-hidden="true" />}
              triggerAriaLabel={actions.menuLabel}
              showChevron={false}
              items={createProductSecondaryActionMenuItems(product, actions, isActionPending)}
              align="end"
            />
            <button
              className={styles.productEditButton}
              type="button"
              data-product-card-edit={product.id}
              disabled={false}
              onClick={() => actions.onEdit(product)}
            >
              {actions.editLabel}
            </button>
          </>
        ) : null}
      </div>
    </Card>
  );
}

type ProductStatusBadgeProps = {
  readonly label: string;
  readonly tone: ProductResponse["status"];
};

function ProductStatusBadge({ label, tone }: ProductStatusBadgeProps) {
  return (
    <span className={classNames(styles.statusBadge, styles[`statusBadge-${tone}`])}>
      <span className={styles.statusBadgeDot} aria-hidden="true" />
      {label}
    </span>
  );
}

type ProductIncludedItemsListProps = {
  readonly items: ProductResponse["includedItems"];
};

function ProductIncludedItemsList({ items }: ProductIncludedItemsListProps) {
  return (
    <ul className={styles.includedList}>
      {items.slice(0, 3).map((item) => (
        <li key={item.id} className={styles.includedItem}>
          <Icon
            iconName={resolveProductIconName(item.icon)}
            width={13}
            height={13}
            aria-hidden="true"
          />
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

function createProductSecondaryActionMenuItems(
  product: ProductResponse,
  actions: ProductCardActions,
  isActionPending: boolean
): readonly ActionMenuItem[] {
  return getProductCardActionItems(product.status, actions)
    .filter((action) => action.kind !== "edit")
    .map((action) => ({
      id: action.kind,
      label: action.label,
      icon: getProductActionIcon(action.kind),
      disabled: isActionPending,
      tone: action.kind === "archive" ? "danger" : "default",
      onSelect: () => runProductCardAction(action, product, actions)
    }));
}

function getProductActionIcon(kind: ProductCardActionItem["kind"]) {
  const iconNameByKind = {
    edit: "edit",
    duplicate: "plus",
    publish: "verified",
    draft: "refresh",
    archive: "trash"
  } as const satisfies Record<
    ProductCardActionItem["kind"],
    Parameters<typeof Icon>[0]["iconName"]
  >;

  return <Icon iconName={iconNameByKind[kind]} width={14} height={14} aria-hidden="true" />;
}

function runProductCardAction(
  action: ProductCardActionItem,
  product: ProductResponse,
  actions: ProductCardActions
) {
  if (action.kind === "edit") {
    actions.onEdit(product);
    return;
  }

  if (action.kind === "duplicate") {
    actions.onDuplicate(product);
    return;
  }

  if (action.targetStatus) {
    actions.onStatusChange(product.id, action.targetStatus);
  }
}
