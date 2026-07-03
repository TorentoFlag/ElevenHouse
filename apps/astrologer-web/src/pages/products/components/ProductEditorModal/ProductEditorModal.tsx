import type { FormEvent } from "react";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { Breadcrumbs } from "@elevenhouse/design-system/navigation";
import "@elevenhouse/design-system/navigation/Breadcrumbs.css";
import type { ProductOptionCopy } from "../../../../features/products/model/productCopy";
import type { ProductFormDraft } from "../../../../features/products/model/productDraft";
import styles from "../../ProductsPage.module.css";

export type ProductEditorModalCopy = {
  readonly createTitle: string;
  readonly closeLabel: string;
  readonly typeLabel: string;
  readonly titleLabel: string;
  readonly titlePlaceholder: string;
  readonly subtitleLabel: string;
  readonly subtitlePlaceholder: string;
  readonly priceLabel: string;
  readonly includedItemsLabel: string;
  readonly cancelLabel: string;
  readonly saveDraftLabel: string;
  readonly savingLabel: string;
  readonly genericError: string;
  readonly breadcrumbsAriaLabel: string;
  readonly productsBreadcrumb: string;
  readonly createBreadcrumb: string;
};

export type ProductEditorModalProps = {
  readonly copy: ProductEditorModalCopy;
  readonly productType: ProductOptionCopy;
  readonly draft: ProductFormDraft;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onDraftChange: (draft: ProductFormDraft) => void;
  readonly onSave: () => Promise<void> | void;
  readonly onClose: () => void;
  readonly onBackToTypeSelection: () => void;
  readonly onCloseCreateFlow: () => void;
};

export function ProductEditorModal({
  copy,
  productType,
  draft,
  isSaving,
  error,
  onDraftChange,
  onSave,
  onClose,
  onBackToTypeSelection,
  onCloseCreateFlow
}: ProductEditorModalProps) {
  return (
    <Modal
      title={copy.createTitle}
      closeLabel={copy.closeLabel}
      className={styles.productsModal}
      onClose={onClose}
    >
      <Breadcrumbs
        className={styles.editorBreadcrumbs}
        ariaLabel={copy.breadcrumbsAriaLabel}
        items={[
          {
            id: "products",
            label: copy.productsBreadcrumb,
            onClick: onCloseCreateFlow
          },
          {
            id: "create",
            label: copy.createBreadcrumb,
            onClick: onBackToTypeSelection
          },
          {
            id: draft.type,
            label: productType.label,
            isCurrent: true
          }
        ]}
      />
      <form
        className={styles.editorForm}
        data-product-editor-form="true"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void onSave();
        }}
      >
        <div className={styles.typePreview}>
          <span className={styles.fieldLabel}>{copy.typeLabel}</span>
          <span className={styles.typePreviewLabel} data-product-editor-type-label="true">
            {productType.label}
          </span>
        </div>

        <div className={styles.editorGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{copy.titleLabel}</span>
            <input
              className={styles.textInput}
              data-product-editor-title="true"
              value={draft.title}
              placeholder={copy.titlePlaceholder}
              autoFocus
              onChange={(event) => onDraftChange({ ...draft, title: event.currentTarget.value })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>{copy.priceLabel}</span>
            <input
              className={styles.textInput}
              data-product-editor-price="true"
              inputMode="numeric"
              value={minorToMajorValue(draft.priceMinor)}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  priceMinor: majorValueToMinor(event.currentTarget.value)
                })
              }
            />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{copy.subtitleLabel}</span>
          <textarea
            className={`${styles.textInput} ${styles.textArea}`}
            data-product-editor-subtitle="true"
            value={draft.subtitle}
            placeholder={copy.subtitlePlaceholder}
            rows={3}
            onChange={(event) => onDraftChange({ ...draft, subtitle: event.currentTarget.value })}
          />
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>{copy.includedItemsLabel}</span>
          <div className={styles.includedEditorList}>
            {draft.includedItems.map((item, index) => (
              <input
                key={`${item.order}-${index}`}
                className={styles.textInput}
                data-product-editor-included-item="true"
                value={item.text}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    includedItems: draft.includedItems.map((currentItem, currentIndex) =>
                      currentIndex === index
                        ? { ...currentItem, text: event.currentTarget.value }
                        : currentItem
                    )
                  })
                }
              />
            ))}
          </div>
        </div>

        {error ? (
          <p className={styles.editorError} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.editorActions}>
          <Button title={copy.cancelLabel} variant="default" onClick={onClose} disabled={isSaving} />
          <Button
            title={isSaving ? copy.savingLabel : copy.saveDraftLabel}
            type="submit"
            disabled={isSaving || !draft.title.trim()}
          />
        </div>
      </form>
    </Modal>
  );
}

function minorToMajorValue(value: number): string {
  return String(Math.floor(value / 100));
}

function majorValueToMinor(value: string): number {
  const normalizedValue = value.replace(/[^\d]/g, "");

  return Number(normalizedValue || 0) * 100;
}
