import type { ProductIncludedItemRequest } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import type { ProductCopy } from "../../../../../features/products/model/productCopy";
import type { ProductFormDraft } from "../../../../../features/products/model/productDraft";
import type { ConstructorUiCopy } from "../helpers/constructorUiCopy";
import type { ProductConstructorModalCopy } from "../types";
import styles from "../ProductConstructorModal.module.css";

export function ProductConstructorHeader({
  copy,
  productCopy,
  uiCopy,
  draft,
  visibleIncludedItems,
  isSaving,
  canSave,
  onPublish,
  onClose
}: {
  readonly copy: ProductConstructorModalCopy;
  readonly productCopy: ProductCopy;
  readonly uiCopy: ConstructorUiCopy;
  readonly draft: ProductFormDraft;
  readonly visibleIncludedItems: readonly ProductIncludedItemRequest[];
  readonly isSaving: boolean;
  readonly canSave: boolean;
  readonly onSave: (
    visibleIncludedItems?: readonly ProductIncludedItemRequest[]
  ) => Promise<void> | void;
  readonly onPublish: (
    visibleIncludedItems?: readonly ProductIncludedItemRequest[]
  ) => Promise<void> | void;
  readonly onClose: () => void;
}) {
  return (
    <header className={styles.productConstructorHeader} data-product-constructor-header="true">
      <div className={styles.productConstructorHeading}>
        <div className={styles.productConstructorBreadcrumbs} aria-label={copy.typeLabel}>
          <span>{uiCopy.productsBreadcrumb}</span>
          <Icon iconName="chevronRight" width={13} height={13} aria-hidden="true" />
          <span>{uiCopy.createBreadcrumb}</span>
          <Icon iconName="chevronRight" width={13} height={13} aria-hidden="true" />
          <strong>{productCopy.types[draft.type].label}</strong>
        </div>
        <h2 className={styles.productConstructorTitle}>{copy.title}</h2>
      </div>
      <div className={styles.productConstructorActions}>
        <Button
          title={isSaving ? copy.savingLabel : copy.saveDraftLabel}
          type="submit"
          variant="glass"
          disabled={!canSave}
          className={styles.productConstructorDraftButton}
        />
        <Button
          title={uiCopy.publishLabel}
          type="button"
          disabled={!canSave}
          className={styles.productConstructorPublishButton}
          onClick={() => {
            void onPublish(visibleIncludedItems);
          }}
        />
        <button
          className={styles.productConstructorCloseButton}
          type="button"
          aria-label={copy.closeLabel}
          onClick={onClose}
        >
          <Icon iconName="close" width={21} height={21} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
