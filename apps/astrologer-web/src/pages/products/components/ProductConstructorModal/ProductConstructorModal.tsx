import type { FormEvent } from "react";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { ProductConstructorEditor } from "./components/ProductConstructorEditor";
import { ProductConstructorHeader } from "./components/ProductConstructorHeader";
import { ProductConstructorPreviewColumn } from "./components/ProductConstructorPreviewColumn";
import { useProductConstructorController } from "./hooks/useProductConstructorController";
import type { ProductConstructorModalProps } from "./types";
import styles from "./ProductConstructorModal.module.css";

export type { ProductConstructorModalCopy, ProductConstructorModalProps } from "./types";

export function ProductConstructorModal({
  copy,
  productCopy,
  locale,
  draft,
  isSaving,
  error,
  portalTarget,
  backdropClassName,
  onDraftChange,
  onSave,
  onPublish,
  onClose
}: ProductConstructorModalProps) {
  const controller = useProductConstructorController({ draft, productCopy, locale, onDraftChange });
  const canSave = !isSaving && Boolean(draft.title.trim());

  return (
    <Modal
      title={copy.title}
      closeLabel={copy.closeLabel}
      portalTarget={portalTarget}
      backdropClassName={backdropClassName}
      className={styles.productConstructorModal}
      contentClassName={styles.productConstructorModalContent}
      onClose={onClose}
    >
      <form
        className={styles.productConstructorForm}
        data-product-constructor-form="true"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          if (!canSave) {
            return;
          }

          void onSave();
        }}
      >
        <div className={styles.productConstructorShell} data-product-constructor-shell="true">
          <ProductConstructorHeader
            copy={copy}
            productCopy={productCopy}
            uiCopy={controller.uiCopy}
            draft={draft}
            isSaving={isSaving}
            canSave={canSave}
            onSave={onSave}
            onPublish={onPublish}
            onClose={onClose}
          />
          <div className={styles.productConstructorGrid}>
            <ProductConstructorEditor
              copy={copy}
              productCopy={productCopy}
              locale={locale}
              draft={draft}
              controller={controller}
            />
            <ProductConstructorPreviewColumn
              copy={copy}
              locale={locale}
              draft={draft}
              controller={controller}
              error={error}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
