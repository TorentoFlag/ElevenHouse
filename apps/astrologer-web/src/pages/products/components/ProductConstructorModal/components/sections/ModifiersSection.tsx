import type { ProductModifierKind } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import {
  modifierInputValueToStoredValue,
  modifierValueToInputValue
} from "../../../../../../features/products/model/productConstructorViewModel";
import type { ProductFormDraft } from "../../../../../../features/products/model/productDraft";
import type { ProductConstructorModalCopy, ProductConstructorSectionProps } from "../../types";
import { SectionHeading } from "../ConstructorPrimitives";
import styles from "../../ProductConstructorModal.module.css";

export function ModifiersSection({ copy, draft, controller }: ProductConstructorSectionProps) {
  const modifierKindLabels = {
    fixed: "₽",
    percent: "%",
    free: controller.uiCopy.modifierFreeShortLabel
  } satisfies Record<ProductModifierKind, string>;

  return (
    <section
      className={styles.constructorSectionPlain}
      aria-labelledby="product-constructor-modifiers"
    >
      <SectionHeading
        id="product-constructor-modifiers"
        title={copy.modifiersLabel}
        hint={controller.uiCopy.modifiersHint}
      />
      <div className={styles.constructorRows}>
        {draft.modifiers.map((modifier, index) => {
          const rowLabel = getModifierRowLabel(modifier, copy, index);

          return (
            <div
              className={`${styles.constructorRow} ${styles.constructorModifierRow}`}
              data-product-constructor-modifier-row="true"
              key={`${modifier.order}-${index}`}
            >
              <button
                className={`${styles.constructorCheckButton} ${modifier.isEnabled ? styles.constructorCheckButtonActive : ""}`}
                type="button"
                aria-label={`${rowLabel}: ${
                  modifier.isEnabled
                    ? controller.uiCopy.modifierEnabledLabel
                    : controller.uiCopy.modifierDisabledLabel
                }`}
                aria-pressed={modifier.isEnabled}
                onClick={() =>
                  controller.actions.updateModifier(index, { isEnabled: !modifier.isEnabled })
                }
              >
                {modifier.isEnabled ? (
                  <Icon iconName="check" width={14} height={14} aria-hidden="true" />
                ) : null}
              </button>
              <input
                className={styles.constructorModName}
                aria-label={`${copy.modifierLabelLabel}: ${rowLabel}`}
                value={modifier.label}
                placeholder={copy.modifierLabelPlaceholder}
                onChange={(event) =>
                  controller.actions.updateModifier(index, { label: event.currentTarget.value })
                }
              />
              {modifier.kind !== "free" ? (
                <input
                  className={`${styles.constructorModPrice} ${styles.textInput}`}
                  aria-label={`${copy.modifierPriceLabel}: ${rowLabel}`}
                  inputMode="numeric"
                  value={modifierValueToInputValue(modifier)}
                  onChange={(event) =>
                    controller.actions.updateModifier(index, {
                      priceMinor: modifierInputValueToStoredValue(
                        modifier.kind,
                        event.currentTarget.value
                      )
                    })
                  }
                />
              ) : null}
              <div className={styles.constructorModifierKinds}>
                {Object.entries(modifierKindLabels).map(([kind, label]) => (
                  <button
                    key={kind}
                    className={`${styles.constructorSegmentButton} ${
                      modifier.kind === kind ? styles.constructorSegmentButtonActive : ""
                    }`}
                    type="button"
                    aria-label={getModifierKindAriaLabel(
                      copy,
                      kind as ProductModifierKind,
                      rowLabel
                    )}
                    aria-pressed={modifier.kind === kind}
                    onClick={() =>
                      controller.actions.updateModifier(index, {
                        kind: kind as ProductModifierKind
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                className={`${styles.constructorIconButton} ${modifier.createsArtifact ? styles.constructorIconButtonActive : ""}`}
                type="button"
                aria-label={`${controller.uiCopy.modifierArtifactLabel}: ${rowLabel}`}
                aria-pressed={modifier.createsArtifact}
                onClick={() =>
                  controller.actions.updateModifier(index, {
                    createsArtifact: !modifier.createsArtifact
                  })
                }
              >
                <Icon iconName="box" width={16} height={16} aria-hidden="true" />
              </button>
              <button
                className={styles.constructorIconButton}
                type="button"
                aria-label={`${copy.removeModifierLabel}: ${rowLabel}`}
                onClick={() => controller.actions.removeModifier(index)}
              >
                <Icon iconName="trash" width={16} height={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
        <button
          className={styles.constructorAddRow}
          type="button"
          onClick={controller.actions.addModifier}
        >
          <Icon iconName="plus" width={15} height={15} aria-hidden="true" />
          <span>{copy.addModifierLabel}</span>
        </button>
      </div>
    </section>
  );
}

function getModifierKindAriaLabel(
  copy: ProductConstructorModalCopy,
  kind: ProductModifierKind,
  rowLabel: string
): string {
  const labelByKind = {
    fixed: copy.modifierFixedLabel,
    percent: copy.modifierPercentLabel,
    free: copy.modifierFreeLabel
  } satisfies Record<ProductModifierKind, string>;

  return `${copy.modifierKindLabel}: ${labelByKind[kind]} · ${rowLabel}`;
}

function getModifierRowLabel(
  modifier: ProductFormDraft["modifiers"][number],
  copy: ProductConstructorModalCopy,
  index: number
): string {
  const label = modifier.label.trim();
  return label || `${copy.modifierLabelPlaceholder} ${index + 1}`;
}
