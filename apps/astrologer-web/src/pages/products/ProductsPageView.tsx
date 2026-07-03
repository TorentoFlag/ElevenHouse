import type {
  ListProductsResponse,
  ProductResponse,
  ProductStatusFilter,
  ProductSummaryResponse
} from "@elevenhouse/contracts";
import type { ProductLocale } from "../../features/products/model/productCopy";
import { productCopyByLocale } from "../../features/products/model/productCopy";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { ProductsResults } from "./components/ProductsResults";
import { ProductsSummaryStrip } from "./components/ProductsSummaryStrip";
import { ProductsToolbar } from "./components/ProductsToolbar";
import styles from "./ProductsPage.module.css";

type ProductsPageCopy = {
  readonly title: string;
  readonly createLabel: string;
  readonly statusFilterAriaLabel: string;
  readonly summary: AstrologerCopy["products"]["summary"];
  readonly actions?: AstrologerCopy["products"]["actions"];
  readonly emptyLabel: string;
  readonly loadingLabel: string;
  readonly errorLabel: string;
};

const defaultProductActionsCopy: AstrologerCopy["products"]["actions"] = {
  editLabel: "Edit",
  duplicateLabel: "Duplicate",
  publishLabel: "Publish",
  draftLabel: "Move to draft",
  archiveLabel: "Archive"
};

export type ProductsPageViewProps = {
  readonly copy: ProductsPageCopy;
  readonly locale: ProductLocale;
  readonly products: ListProductsResponse["products"];
  readonly summary: ProductSummaryResponse | null;
  readonly counts: ListProductsResponse["counts"];
  readonly selectedStatus: ProductStatusFilter;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onStatusChange: (status: ProductStatusFilter) => void;
  readonly onCreate: () => void;
  readonly onEditProduct?: (product: ProductResponse) => void;
  readonly onDuplicateProduct?: (productId: string) => void;
  readonly onProductStatusChange?: (productId: string, status: ProductResponse["status"]) => void;
};

export function ProductsPageView({
  copy,
  locale,
  products,
  summary,
  counts,
  selectedStatus,
  isLoading,
  isError,
  onStatusChange,
  onCreate,
  onEditProduct = () => undefined,
  onDuplicateProduct = () => undefined,
  onProductStatusChange = () => undefined
}: ProductsPageViewProps) {
  const productCopy = productCopyByLocale[locale];
  const actionsCopy = copy.actions ?? defaultProductActionsCopy;

  return (
    <section className={styles.productsPage} aria-labelledby="products-title">
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
      />
      <div className={styles.content}>
        <ProductsSummaryStrip copy={copy.summary} locale={locale} summary={summary} />
        <ProductsResults
          products={products}
          productCopy={productCopy}
          locale={locale}
          actions={{
            ...actionsCopy,
            onEdit: onEditProduct,
            onDuplicate: onDuplicateProduct,
            onStatusChange: onProductStatusChange
          }}
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
