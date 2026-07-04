import { Icon } from "@elevenhouse/design-system/icons/Icon";
import {
  formatModifierSuffix,
  getPreviewCoverPlaceholder
} from "../../../../../features/products/model/productConstructorViewModel";
import type { ProductConstructorModalCopy } from "../types";
import type { ProductConstructorController } from "../hooks/useProductConstructorController";
import type { ProductFormDraft } from "../../../../../features/products/model/productDraft";
import type { ProductLocale } from "../../../../../features/products/model/productCopy";
import styles from "../ProductConstructorModal.module.css";

export function ProductConstructorPreviewColumn({
  copy,
  locale,
  draft,
  controller,
  coverMediaUrl,
  error
}: {
  readonly copy: ProductConstructorModalCopy;
  readonly locale: ProductLocale;
  readonly draft: ProductFormDraft;
  readonly controller: ProductConstructorController;
  readonly coverMediaUrl: string | null;
  readonly error: string | null;
}) {
  const { uiCopy, viewModel } = controller;
  const { preview, previewIconName, enabledModifiers, cabinetArtifacts } = viewModel;

  return (
    <aside
      className={styles.constructorPreviewColumn}
      data-product-constructor-preview-panel="true"
      aria-labelledby="product-constructor-preview"
    >
      <h3 id="product-constructor-preview" className={styles.constructorPreviewKicker}>
        {uiCopy.previewClientLabel}
      </h3>
      <div className={styles.constructorClientCard}>
        <div
          className={styles.constructorPreviewCover}
          data-product-constructor-preview-cover="true"
        >
          {coverMediaUrl ? (
            <img src={coverMediaUrl} alt="" className={styles.constructorCoverImage} />
          ) : (
            <>
              <Icon iconName="image" width={42} height={42} aria-hidden="true" />
              <span>{getPreviewCoverPlaceholder(uiCopy.coverPlaceholder)}</span>
            </>
          )}
        </div>
        <div className={styles.constructorPreviewHeader}>
          <span className={styles.constructorPreviewIcon} aria-hidden="true">
            <Icon iconName={previewIconName} width={24} height={24} />
          </span>
          <div className={styles.constructorPreviewHeading}>
            <span>{preview.categoryLabel}</span>
            <strong>{draft.title.trim() || copy.titlePlaceholder}</strong>
            {draft.subtitle.trim() ? <p>{draft.subtitle}</p> : null}
          </div>
          <span className={styles.constructorStatusBadge}>
            <span />
            {uiCopy.draftStatusLabel}
          </span>
        </div>
        <div className={styles.constructorPreviewPriceLine}>
          <strong>{preview.priceLabel}</strong>
          {preview.formatLine ? <span>· {preview.formatLine}</span> : null}
        </div>
        <ul className={styles.constructorPreviewList}>
          {preview.includedItems.map((item, index) => (
            <li key={`${item.text}-${index}`}>
              <Icon iconName={item.icon} width={16} height={16} aria-hidden="true" />
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
        {enabledModifiers.length > 0 ? (
          <div className={styles.constructorUpsells}>
            <span>{uiCopy.upsellLabel}</span>
            <div>
              {enabledModifiers.map((modifier, index) => (
                <span data-product-constructor-upsell="true" key={`${modifier.order}-${index}`}>
                  {modifier.label || copy.modifierLabelPlaceholder}
                  <strong>{formatModifierSuffix(modifier, locale, uiCopy)}</strong>
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className={styles.constructorPreviewActions}>
          <button type="button" tabIndex={-1}>
            {preview.actionLabel}
          </button>
          {draft.participantMode !== "group" ? (
            <button type="button" tabIndex={-1}>
              <Icon iconName="gift" width={16} height={16} aria-hidden="true" />
              {uiCopy.giftLabel}
            </button>
          ) : null}
        </div>
      </div>

      <h3 className={styles.constructorPreviewKicker}>{uiCopy.clientGetsLabel}</h3>
      <div className={styles.constructorCabinetCard}>
        <div className={styles.constructorCabinetHeader}>
          <Icon iconName="verified" width={16} height={16} aria-hidden="true" />
          <span>
            {uiCopy.clientCabinetLabel} ·{" "}
            {draft.executionMode === "live" ? uiCopy.afterSessionLabel : uiCopy.afterDeliveryLabel}
          </span>
        </div>
        <div className={styles.constructorCabinetList}>
          {cabinetArtifacts.map((artifact, index) => (
            <div
              className={styles.constructorCabinetArtifact}
              data-product-constructor-cabinet-artifact="true"
              key={`${artifact.label}-${index}`}
            >
              <Icon iconName={artifact.icon} width={17} height={17} aria-hidden="true" />
              <span>{artifact.label}</span>
              <strong>{artifact.action}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.constructorPreviewNote}>
        <Icon iconName="sparkle" width={16} height={16} aria-hidden="true" />
        <span>{uiCopy.fieldAutomationNote}</span>
      </div>
      {error ? (
        <p className={styles.editorError} role="alert">
          {error}
        </p>
      ) : null}
    </aside>
  );
}
