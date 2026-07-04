import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { resolveProductIconName } from "../../../../../../features/products/model/productIcons";
import type { ProductConstructorSectionProps } from "../../types";
import { SectionHeading } from "../ConstructorPrimitives";
import styles from "../../ProductConstructorModal.module.css";

export function IncludedItemsSection({ copy, draft, controller }: ProductConstructorSectionProps) {
  const { uiCopy, viewModel, actions } = controller;

  return (
    <section
      className={`${styles.constructorSectionPlain} ${styles.constructorIncludedSection}`}
      aria-labelledby="product-constructor-included"
    >
      <SectionHeading
        id="product-constructor-included"
        title={copy.includedItemsLabel}
        hint={uiCopy.includedItemsHint}
      />
      <div className={styles.constructorRows}>
        {viewModel.autoIncludedItems.map((item) => (
          <div
            className={styles.constructorIncludedRow}
            data-product-constructor-included-auto-row="true"
            key={item.key}
          >
            <Icon
              iconName={resolveProductIconName(item.icon)}
              width={15}
              height={15}
              aria-hidden="true"
            />
            <span>{item.text}</span>
            <em>{item.tag}</em>
            <span
              className={`${styles.constructorInlineIconButton} ${styles.constructorInlineIconButtonActive}`}
              aria-label={uiCopy.autoIncludedVisibleLabel}
            >
              <Icon iconName="verified" width={14} height={14} aria-hidden="true" />
            </span>
          </div>
        ))}
        {draft.includedItems.map((item, index) => {
          const selectedIcon = resolveProductIconName(item.icon);

          return (
            <div
              className={`${styles.constructorIncludedRow} ${styles.constructorIncludedCustomRow}`}
              data-product-constructor-included-custom-row="true"
              key={`${item.order}-${index}`}
            >
              <button
                className={styles.constructorSmallIconButton}
                type="button"
                aria-label={copy.includedItemIconLabel}
                onClick={() => actions.cycleIncludedItemIcon(index, item.icon)}
              >
                <Icon iconName={selectedIcon} width={15} height={15} aria-hidden="true" />
              </button>
              <input
                className={styles.constructorInlineTextInput}
                aria-label={copy.includedItemTextLabel}
                value={item.text}
                placeholder={copy.includedItemPlaceholder}
                onChange={(event) =>
                  actions.updateIncludedItem(index, { text: event.currentTarget.value })
                }
              />
              <button
                className={styles.constructorInlineIconButton}
                type="button"
                aria-label={copy.removeIncludedItemLabel}
                onClick={() => actions.removeIncludedItem(index)}
              >
                <Icon iconName="trash" width={16} height={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
        <div className={styles.constructorAddRow}>
          <Icon iconName="plus" width={15} height={15} aria-hidden="true" />
          <input
            placeholder={`${copy.addIncludedItemLabel}…`}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                actions.addCustomIncludedItem(event.currentTarget.value);
                event.currentTarget.value = "";
              }
            }}
          />
        </div>
      </div>
    </section>
  );
}
