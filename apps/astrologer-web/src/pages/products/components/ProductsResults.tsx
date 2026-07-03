import type { ListProductsResponse } from "@elevenhouse/contracts";
import type { ProductCopy, ProductLocale } from "../../../features/products/model/productCopy";
import { ProductCard, type ProductCardActions } from "./ProductCard";
import styles from "../ProductsPage.module.css";

export type ProductsResultsProps = {
  readonly products: ListProductsResponse["products"];
  readonly productCopy: ProductCopy;
  readonly locale: ProductLocale;
  readonly actions: ProductCardActions;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly loadingLabel: string;
  readonly errorLabel: string;
  readonly emptyLabel: string;
};

export function ProductsResults({
  products,
  productCopy,
  locale,
  actions,
  isLoading,
  isError,
  loadingLabel,
  errorLabel,
  emptyLabel
}: ProductsResultsProps) {
  return (
    <div className={styles.results}>
      {isLoading && <p className={styles.contentState}>{loadingLabel}</p>}
      {isError && <p className={styles.contentState}>{errorLabel}</p>}
      {!isLoading && !isError && products.length === 0 && (
        <p className={styles.emptyState}>{emptyLabel}</p>
      )}
      {!isLoading && !isError && products.length > 0 && (
        <div className={styles.productGrid}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              productCopy={productCopy}
              locale={locale}
              actions={actions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
