import type {
  ListProductsResponse,
  ProductResponse,
  ProductStatusFilter,
  ProductSummaryResponse
} from "@elevenhouse/contracts";
import type { Ref } from "react";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import type { ProductLocale } from "../../features/products/model/productCopy";
import { productCopyByLocale } from "../../features/products/model/productCopy";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { ProductsResults } from "./components/ProductsResults";
import { ProductActionErrorNotice } from "./components/ProductActionErrorNotice";
import { ProductsSummaryStrip } from "./components/ProductsSummaryStrip";
import { ProductsToolbar } from "./components/ProductsToolbar";
import styles from "./ProductsPage.module.css";

type ProductsPageCopy = {
  readonly title: string;
  readonly createLabel: string;
  readonly statusFilterAriaLabel: string;
  readonly summary: AstrologerCopy["products"]["summary"];
  readonly actions: AstrologerCopy["products"]["actions"];
  readonly emptyLabel: string;
  readonly loadingLabel: string;
  readonly errorLabel: string;
  readonly actionErrorReloadLabel: string;
};

export type ProductsPageViewProps = {
  readonly modalScopeRef?: Ref<HTMLElement>;
  readonly copy: ProductsPageCopy;
  readonly locale: ProductLocale;
  readonly products: ListProductsResponse["products"];
  readonly summary: ProductSummaryResponse | null;
  readonly counts: ListProductsResponse["counts"];
  readonly selectedStatus: ProductStatusFilter;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isTariffLocked: boolean;
  readonly canManageProducts: boolean;
  readonly isProductActionPending: boolean;
  readonly productActionError: string | null;
  readonly onStatusChange: (status: ProductStatusFilter) => void;
  readonly onCreate: () => void;
  readonly onManageTariff: () => void;
  readonly onEditProduct: (product: ProductResponse) => void;
  readonly onDuplicateProduct: (product: ProductResponse) => void;
  readonly onProductStatusChange: (productId: string, status: ProductResponse["status"]) => void;
  readonly onReloadProductAuthority: () => Promise<void> | void;
};

export function ProductsPageView({
  modalScopeRef,
  copy,
  locale,
  products,
  summary,
  counts,
  selectedStatus,
  isLoading,
  isError,
  isTariffLocked,
  canManageProducts,
  isProductActionPending,
  productActionError,
  onStatusChange,
  onCreate,
  onManageTariff,
  onEditProduct,
  onDuplicateProduct,
  onProductStatusChange,
  onReloadProductAuthority
}: ProductsPageViewProps) {
  const productCopy = productCopyByLocale[locale];

  if (isTariffLocked) {
    return (
      <section className={styles.productsPage} aria-labelledby="products-title" ref={modalScopeRef}>
        <div className={styles.capabilityLockedState}>
          <span className={styles.capabilityLockedEyebrow}>Продукты</span>
          <div>
            <h1 id="products-title">Продукты доступны по тарифу</h1>
            <p>
              Активный тариф даёт доступ к созданию и управлению продуктами. Выберите тариф, чтобы
              продолжить.
            </p>
          </div>
          <Button
            className={styles.capabilityLockedAction}
            type="button"
            variant="brand"
            size="big"
            title="Выбрать тариф"
            onClick={onManageTariff}
          />
        </div>
      </section>
    );
  }

  return (
    <section className={styles.productsPage} aria-labelledby="products-title" ref={modalScopeRef}>
      <ProductsToolbar
        title={copy.title}
        total={counts.all}
        statusFilterAriaLabel={copy.statusFilterAriaLabel}
        createLabel={copy.createLabel}
        counts={counts}
        selectedStatus={selectedStatus}
        statusFilters={productCopy.statusFilters}
        onStatusChange={onStatusChange}
        onCreate={onCreate}
        canCreate={canManageProducts}
      />
      <div className={styles.content}>
        {productActionError ? (
          <ProductActionErrorNotice
            message={productActionError}
            reloadLabel={copy.actionErrorReloadLabel}
            onReload={onReloadProductAuthority}
          />
        ) : null}
        <ProductsSummaryStrip copy={copy.summary} locale={locale} summary={summary} />
        <ProductsResults
          products={products}
          productCopy={productCopy}
          locale={locale}
          actions={{
            ...copy.actions,
            onEdit: onEditProduct,
            onDuplicate: onDuplicateProduct,
            onStatusChange: onProductStatusChange
          }}
          isActionPending={isProductActionPending}
          canManageProducts={canManageProducts}
          isLoading={isLoading}
          isError={isError}
          loadingLabel={copy.loadingLabel}
          errorLabel={copy.errorLabel}
          emptyLabel={copy.emptyLabel}
        />
      </div>
    </section>
  );
}
