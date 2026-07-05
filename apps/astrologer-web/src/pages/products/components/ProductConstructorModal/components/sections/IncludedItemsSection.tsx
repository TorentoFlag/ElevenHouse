import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { productIconNames } from "../../../../../../features/products/model/productConstructorOptions";
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
        {viewModel.autoIncludedItems.map((item) => {
          const isVisible = !draft.hiddenAutoIncludedKeys.includes(item.key);

          return (
            <div
              className={`${styles.constructorIncludedRow} ${
                isVisible ? "" : styles.constructorIncludedRowHidden
              }`}
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
              <button
                className={`${styles.constructorInlineIconButton} ${
                  isVisible ? styles.constructorInlineIconButtonActive : ""
                }`}
                type="button"
                aria-label={`${uiCopy.autoIncludedVisibleLabel}: ${item.text}`}
                onClick={() => actions.toggleAutoIncludedItem(item.key)}
              >
                <Icon
                  iconName={isVisible ? "verified" : "close"}
                  width={14}
                  height={14}
                  aria-hidden="true"
                />
              </button>
            </div>
          );
        })}
        {draft.includedItems.map((item, index) => {
          const selectedIcon = resolveProductIconName(item.icon);

          return (
            <div
              className={`${styles.constructorIncludedRow} ${styles.constructorIncludedCustomRow}`}
              data-product-constructor-included-custom-row="true"
              key={`${item.order}-${index}`}
            >
              <span className={styles.constructorIncludedMoveControls}>
                <button
                  className={styles.constructorNudgeButton}
                  type="button"
                  aria-label={`${copy.includedItemTextLabel}: ${item.text || index + 1} вверх`}
                  disabled={index === 0}
                  onClick={() => actions.moveIncludedItem(index, -1)}
                >
                  <Icon
                    iconName="chevronDown"
                    className={styles.constructorNudgeIconUp}
                    width={12}
                    height={12}
                    aria-hidden="true"
                  />
                </button>
                <button
                  className={styles.constructorNudgeButton}
                  type="button"
                  aria-label={`${copy.includedItemTextLabel}: ${item.text || index + 1} вниз`}
                  disabled={index === draft.includedItems.length - 1}
                  onClick={() => actions.moveIncludedItem(index, 1)}
                >
                  <Icon iconName="chevronDown" width={12} height={12} aria-hidden="true" />
                </button>
              </span>
              <span className={styles.constructorIncludedIconSelect}>
                <Icon iconName={selectedIcon} width={15} height={15} aria-hidden="true" />
                <select
                  aria-label={`${copy.includedItemIconLabel}: ${item.text || index + 1}`}
                  value={selectedIcon}
                  onChange={(event) =>
                    actions.updateIncludedItem(index, { icon: event.currentTarget.value })
                  }
                >
                  {productIconNames.map((iconName) => (
                    <option key={iconName} value={iconName}>
                      {iconName}
                    </option>
                  ))}
                </select>
              </span>
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
            data-product-constructor-add-included-input="true"
            placeholder={`${copy.addIncludedItemLabel}…`}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                actions.addCustomIncludedItem(event.currentTarget.value);
                event.currentTarget.value = "";
              }
            }}
          />
          <button
            data-product-constructor-add-included-button="true"
            className={styles.constructorInlineAddButton}
            type="button"
            onClick={(event) => {
              const input = event.currentTarget.previousElementSibling;
              if (hasMutableInputValue(input)) {
                actions.addCustomIncludedItem(input.value);
                input.value = "";
              }
            }}
          >
            {copy.addIncludedItemLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

function hasMutableInputValue(value: Element | null): value is HTMLInputElement {
  return Boolean(value && "value" in value && typeof value.value === "string");
}
