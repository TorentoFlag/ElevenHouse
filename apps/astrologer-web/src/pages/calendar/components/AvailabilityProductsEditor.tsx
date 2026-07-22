import type { ProductResponse } from "@elevenhouse/contracts";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import {
  toggleAvailabilityProduct,
  type AvailabilityEditorForm
} from "../../../features/availability/model/availabilityEditorForm";
import styles from "../CalendarPage.module.css";

type AvailabilityProductsEditorProps = {
  readonly copy: AstrologerCopy["calendar"]["availabilityEditor"];
  readonly form: AvailabilityEditorForm;
  readonly products: readonly Pick<ProductResponse, "id" | "title">[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onRetry: () => void;
  readonly onChange: (form: AvailabilityEditorForm) => void;
};

export function AvailabilityProductsEditor({
  copy,
  form,
  products,
  isLoading,
  isError,
  onRetry,
  onChange
}: AvailabilityProductsEditorProps) {
  return (
    <section className={styles.editorSection}>
      <div className={styles.editorSectionHeading}>
        <div><h3>{copy.productsTitle}</h3><p>{copy.productsDescription}</p></div>
      </div>
      {isLoading ? <p className={styles.editorMuted} aria-busy="true">{copy.productsLoadingLabel}</p> : null}
      {isError ? (
        <div className={styles.inlineError} role="alert">
          <p className={styles.editorError}>{copy.productsErrorLabel}</p>
          <button className={styles.inlineButton} type="button" onClick={onRetry}>{copy.retryLabel}</button>
        </div>
      ) : null}
      {!isLoading && !isError && products.length === 0 ? (
        <p className={styles.editorMuted}>{copy.productsEmptyLabel}</p>
      ) : null}
      <div className={styles.productList}>
        {products.map((product) => (
          <label className={styles.productOption} key={product.id}>
            <input
              type="checkbox"
              name="availabilityProductIds"
              checked={form.productIds.includes(product.id)}
              onChange={() => onChange(toggleAvailabilityProduct(form, product.id))}
            />
            <span>{product.title}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
