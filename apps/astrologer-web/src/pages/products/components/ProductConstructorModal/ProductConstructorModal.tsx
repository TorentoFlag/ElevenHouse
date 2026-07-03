import type { ComponentType, FormEvent } from "react";
import type { IconName } from "@elevenhouse/design-system/icons/Icon";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { IconPicker } from "@elevenhouse/design-system/components/IconPicker";
import "@elevenhouse/design-system/components/IconPicker.css";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { NumberStepper } from "@elevenhouse/design-system/components/NumberStepper";
import "@elevenhouse/design-system/components/NumberStepper.css";
import { SelectableTile } from "@elevenhouse/design-system/components/SelectableTile";
import "@elevenhouse/design-system/components/SelectableTile.css";
import type {
  ProductAccessGrant,
  ProductDeliveryFormat,
  ProductExecutionMode,
  ProductMethod,
  ProductModifierKind,
  ProductParticipantMode,
  ProductPaymentModel,
  ProductRequiredClientData,
  ProductSubscriptionPeriod,
  ProductType
} from "@elevenhouse/contracts";
import type { ProductCopy, ProductLocale } from "../../../../features/products/model/productCopy";
import { formatMoneyMinor } from "../../../../features/products/model/productFormatting";
import {
  addProductIncludedItem,
  addProductModifier,
  removeProductIncludedItem,
  removeProductModifier,
  toggleProductDraftArrayValue,
  updateProductIncludedItem,
  updateProductModifier,
  type ProductFormDraft
} from "../../../../features/products/model/productDraft";
import {
  productAccessGrantOptions,
  productDeliveryFormatOptions,
  productExecutionModeOptions,
  productIconNames,
  productMethodOptions,
  productParticipantModeOptions,
  productPaymentModelOptions,
  productRequiredClientDataOptions,
  productSubscriptionPeriodOptions,
  type ProductConstructorOption
} from "../../../../features/products/model/productConstructorOptions";
import styles from "../../ProductsPage.module.css";

export type ProductConstructorModalCopy = {
  readonly title: string;
  readonly closeLabel: string;
  readonly typeLabel: string;
  readonly titleLabel: string;
  readonly titlePlaceholder: string;
  readonly subtitleLabel: string;
  readonly subtitlePlaceholder: string;
  readonly priceLabel: string;
  readonly durationLabel: string;
  readonly durationSuffix: string;
  readonly decrementDurationLabel: string;
  readonly incrementDurationLabel: string;
  readonly formatLabel: string;
  readonly executionModeLabel: string;
  readonly paymentModelLabel: string;
  readonly packageLabel: string;
  readonly packageSessionCountLabel: string;
  readonly packageDiscountLabel: string;
  readonly subscriptionLabel: string;
  readonly subscriptionPeriodLabel: string;
  readonly trialDaysLabel: string;
  readonly participantModeLabel: string;
  readonly groupSizeLabel: string;
  readonly requiredClientDataLabel: string;
  readonly methodsLabel: string;
  readonly accessGrantsLabel: string;
  readonly includedItemsLabel: string;
  readonly includedItemPlaceholder: string;
  readonly includedItemIconLabel: string;
  readonly addIncludedItemLabel: string;
  readonly removeIncludedItemLabel: string;
  readonly modifiersLabel: string;
  readonly modifierLabelPlaceholder: string;
  readonly modifierPriceLabel: string;
  readonly addModifierLabel: string;
  readonly removeModifierLabel: string;
  readonly previewLabel: string;
  readonly previewPriceLabel: string;
  readonly previewIncludedItemsLabel: string;
  readonly cancelLabel: string;
  readonly saveDraftLabel: string;
  readonly savingLabel: string;
  readonly iconLabelByName: Record<string, string>;
};

export type ProductConstructorModalProps = {
  readonly copy: ProductConstructorModalCopy;
  readonly productCopy: ProductCopy;
  readonly locale: ProductLocale;
  readonly draft: ProductFormDraft;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onDraftChange: (draft: ProductFormDraft) => void;
  readonly onSave: () => Promise<void> | void;
  readonly onClose: () => void;
};

const productTypeIconByType = {
  single: "video",
  pack: "box",
  async: "refresh",
  sub: "flow",
  mini: "chat",
  course: "content",
  custom: "sparkle"
} satisfies Record<ProductType, IconName>;

const productTypeOptions = Object.entries(productTypeIconByType).map(([value, iconName]) => ({
  value: value as ProductType,
  iconName
}));

const modifierKindLabels = {
  fixed: "+",
  percent: "%",
  free: "0"
} satisfies Record<ProductModifierKind, string>;

type ProductIconName = (typeof productIconNames)[number];

type ProductIconPickerProps = {
  readonly value: ProductIconName;
  readonly iconNames: readonly ProductIconName[];
  readonly ariaLabel: string;
  readonly className?: string;
  readonly getIconAriaLabel: (iconName: ProductIconName) => string;
  readonly onValueChange: (value: ProductIconName) => void;
};

const ProductIconPicker = IconPicker as unknown as ComponentType<ProductIconPickerProps>;

export function ProductConstructorModal({
  copy,
  productCopy,
  locale,
  draft,
  isSaving,
  error,
  onDraftChange,
  onSave,
  onClose
}: ProductConstructorModalProps) {
  const updateDraft = (patch: Partial<ProductFormDraft>) => {
    onDraftChange({ ...draft, ...patch });
  };

  return (
    <Modal
      title={copy.title}
      closeLabel={copy.closeLabel}
      className={styles.productConstructorModal}
      contentClassName={styles.productConstructorModalContent}
      onClose={onClose}
    >
      <form
        className={styles.productConstructorForm}
        data-product-constructor-form="true"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void onSave();
        }}
      >
        <div className={styles.constructorMain}>
          <section className={styles.constructorSection} aria-labelledby="product-constructor-type">
            <h3 id="product-constructor-type" className={styles.constructorSectionTitle}>
              {copy.typeLabel}
            </h3>
            <div className={styles.constructorTileGrid}>
              {productTypeOptions.map((option) => (
                <SelectableTile
                  key={option.value}
                  className={styles.constructorTile}
                  label={productCopy.types[option.value].label}
                  description={productCopy.types[option.value].description}
                  selected={draft.type === option.value}
                  icon={<Icon iconName={option.iconName} width={18} height={18} aria-hidden="true" />}
                  onClick={() => updateDraft({ type: option.value })}
                />
              ))}
            </div>
          </section>

          <section className={styles.constructorSection} aria-labelledby="product-constructor-title">
            <h3 id="product-constructor-title" className={styles.constructorSectionTitle}>
              {copy.titleLabel}
            </h3>
            <div className={styles.constructorFieldsGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{copy.titleLabel}</span>
                <input
                  className={styles.textInput}
                  data-product-constructor-title="true"
                  value={draft.title}
                  placeholder={copy.titlePlaceholder}
                  autoFocus
                  onChange={(event) => updateDraft({ title: event.currentTarget.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{copy.priceLabel}</span>
                <input
                  className={styles.textInput}
                  inputMode="numeric"
                  value={minorToMajorValue(draft.priceMinor)}
                  onChange={(event) => updateDraft({ priceMinor: majorValueToMinor(event.currentTarget.value) })}
                />
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{copy.subtitleLabel}</span>
              <textarea
                className={`${styles.textInput} ${styles.textArea}`}
                value={draft.subtitle}
                placeholder={copy.subtitlePlaceholder}
                rows={3}
                onChange={(event) => updateDraft({ subtitle: event.currentTarget.value })}
              />
            </label>
          </section>

          <section className={styles.constructorSection} aria-labelledby="product-constructor-format">
            <h3 id="product-constructor-format" className={styles.constructorSectionTitle}>
              {copy.formatLabel}
            </h3>
            {renderMultiSelectSection<ProductDeliveryFormat>({
              options: productDeliveryFormatOptions,
              selectedValues: draft.deliveryFormats,
              copyByValue: productCopy.deliveryFormats,
              onToggle: (value) =>
                onDraftChange(toggleProductDraftArrayValue(draft, "deliveryFormats", value))
            })}
          </section>

          <section className={styles.constructorSection} aria-labelledby="product-constructor-execution">
            <h3 id="product-constructor-execution" className={styles.constructorSectionTitle}>
              {copy.executionModeLabel}
            </h3>
            {renderSingleSelectSection<ProductExecutionMode>({
              options: productExecutionModeOptions,
              selectedValue: draft.executionMode,
              copyByValue: productCopy.executionModes,
              onSelect: (value) => updateDraft({ executionMode: value })
            })}
            <div className={styles.constructorStepperRow}>
              <span className={styles.fieldLabel}>{copy.durationLabel}</span>
              <NumberStepper
                value={draft.durationMinutes ?? 0}
                min={0}
                step={15}
                suffix={copy.durationSuffix}
                decrementLabel={copy.decrementDurationLabel}
                incrementLabel={copy.incrementDurationLabel}
                onValueChange={(value) => updateDraft({ durationMinutes: value || null })}
              />
            </div>
          </section>

          <section className={styles.constructorSection} aria-labelledby="product-constructor-payment">
            <h3 id="product-constructor-payment" className={styles.constructorSectionTitle}>
              {copy.paymentModelLabel}
            </h3>
            {renderSingleSelectSection<ProductPaymentModel>({
              options: productPaymentModelOptions,
              selectedValue: draft.paymentModel,
              copyByValue: productCopy.paymentModels,
              onSelect: (value) => updateDraft({ paymentModel: value })
            })}
            {draft.paymentModel === "pack" ? (
              <div className={styles.constructorConditionalPanel}>
                <h4 className={styles.constructorSubsectionTitle}>{copy.packageLabel}</h4>
                <div className={styles.constructorStepperRow}>
                  <span className={styles.fieldLabel}>{copy.packageSessionCountLabel}</span>
                  <NumberStepper
                    value={draft.packageSessionCount ?? 1}
                    min={1}
                    decrementLabel={copy.packageSessionCountLabel}
                    incrementLabel={copy.packageSessionCountLabel}
                    onValueChange={(value) => updateDraft({ packageSessionCount: value })}
                  />
                </div>
                <div className={styles.constructorStepperRow}>
                  <span className={styles.fieldLabel}>{copy.packageDiscountLabel}</span>
                  <NumberStepper
                    value={draft.packageDiscountPercent ?? 0}
                    min={0}
                    max={100}
                    suffix="%"
                    decrementLabel={copy.packageDiscountLabel}
                    incrementLabel={copy.packageDiscountLabel}
                    onValueChange={(value) => updateDraft({ packageDiscountPercent: value })}
                  />
                </div>
              </div>
            ) : null}
            {draft.paymentModel === "sub" ? (
              <div className={styles.constructorConditionalPanel}>
                <h4 className={styles.constructorSubsectionTitle}>{copy.subscriptionLabel}</h4>
                <span className={styles.fieldLabel}>{copy.subscriptionPeriodLabel}</span>
                {renderSingleSelectSection<ProductSubscriptionPeriod>({
                  options: productSubscriptionPeriodOptions,
                  selectedValue: draft.subscriptionPeriod ?? "month",
                  copyByValue: productCopy.subscriptionPeriods,
                  onSelect: (value) => updateDraft({ subscriptionPeriod: value })
                })}
                <div className={styles.constructorStepperRow}>
                  <span className={styles.fieldLabel}>{copy.trialDaysLabel}</span>
                  <NumberStepper
                    value={draft.trialDays ?? 0}
                    min={0}
                    decrementLabel={copy.trialDaysLabel}
                    incrementLabel={copy.trialDaysLabel}
                    onValueChange={(value) => updateDraft({ trialDays: value || null })}
                  />
                </div>
              </div>
            ) : null}
          </section>

          <section className={styles.constructorSection} aria-labelledby="product-constructor-participants">
            <h3 id="product-constructor-participants" className={styles.constructorSectionTitle}>
              {copy.participantModeLabel}
            </h3>
            {renderSingleSelectSection<ProductParticipantMode>({
              options: productParticipantModeOptions,
              selectedValue: draft.participantMode,
              copyByValue: productCopy.participantModes,
              onSelect: (value) => updateDraft({ participantMode: value })
            })}
            {draft.participantMode === "group" ? (
              <div className={styles.constructorStepperRow}>
                <span className={styles.fieldLabel}>{copy.groupSizeLabel}</span>
                <NumberStepper
                  value={draft.groupSize ?? 2}
                  min={2}
                  decrementLabel={copy.groupSizeLabel}
                  incrementLabel={copy.groupSizeLabel}
                  onValueChange={(value) => updateDraft({ groupSize: value })}
                />
              </div>
            ) : null}
          </section>

          <section className={styles.constructorSection} aria-labelledby="product-constructor-client-data">
            <h3 id="product-constructor-client-data" className={styles.constructorSectionTitle}>
              {copy.requiredClientDataLabel}
            </h3>
            {renderMultiSelectSection<ProductRequiredClientData>({
              options: productRequiredClientDataOptions,
              selectedValues: draft.requiredClientData,
              copyByValue: productCopy.requiredClientData,
              onToggle: (value) =>
                onDraftChange(toggleProductDraftArrayValue(draft, "requiredClientData", value))
            })}
          </section>

          <section className={styles.constructorSection} aria-labelledby="product-constructor-methods">
            <h3 id="product-constructor-methods" className={styles.constructorSectionTitle}>
              {copy.methodsLabel}
            </h3>
            {renderMultiSelectSection<ProductMethod>({
              options: productMethodOptions,
              selectedValues: draft.methods,
              copyByValue: productCopy.methods,
              onToggle: (value) => onDraftChange(toggleProductDraftArrayValue(draft, "methods", value))
            })}
          </section>

          <section className={styles.constructorSection} aria-labelledby="product-constructor-access">
            <h3 id="product-constructor-access" className={styles.constructorSectionTitle}>
              {copy.accessGrantsLabel}
            </h3>
            {renderMultiSelectSection<ProductAccessGrant>({
              options: productAccessGrantOptions,
              selectedValues: draft.accessGrants,
              copyByValue: productCopy.accessGrants,
              onToggle: (value) =>
                onDraftChange(toggleProductDraftArrayValue(draft, "accessGrants", value))
            })}
          </section>

          <section className={styles.constructorSection} aria-labelledby="product-constructor-included">
            <div className={styles.constructorSectionHeader}>
              <h3 id="product-constructor-included" className={styles.constructorSectionTitle}>
                {copy.includedItemsLabel}
              </h3>
              <Button
                title={copy.addIncludedItemLabel}
                size="small"
                variant="default"
                onClick={() => onDraftChange(addProductIncludedItem(draft))}
              />
            </div>
            <div className={styles.constructorRows}>
              {draft.includedItems.map((item, index) => {
                const selectedIcon = resolveProductIconName(item.icon);

                return (
                  <div className={styles.constructorRow} key={`${item.order}-${index}`}>
                    <ProductIconPicker
                      value={selectedIcon}
                      iconNames={productIconNames}
                      ariaLabel={copy.includedItemIconLabel}
                      className={styles.constructorIconPicker}
                      getIconAriaLabel={(iconName) => copy.iconLabelByName[iconName] ?? iconName}
                      onValueChange={(value) =>
                        onDraftChange(updateProductIncludedItem(draft, index, { icon: value }))
                      }
                    />
                    <input
                      className={styles.textInput}
                      value={item.text}
                      placeholder={copy.includedItemPlaceholder}
                      onChange={(event) =>
                        onDraftChange(
                          updateProductIncludedItem(draft, index, { text: event.currentTarget.value })
                        )
                      }
                    />
                    <button
                      className={styles.constructorIconButton}
                      type="button"
                      aria-label={copy.removeIncludedItemLabel}
                      onClick={() => onDraftChange(removeProductIncludedItem(draft, index))}
                    >
                      <Icon iconName="close" width={16} height={16} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={styles.constructorSection} aria-labelledby="product-constructor-modifiers">
            <div className={styles.constructorSectionHeader}>
              <h3 id="product-constructor-modifiers" className={styles.constructorSectionTitle}>
                {copy.modifiersLabel}
              </h3>
              <Button
                title={copy.addModifierLabel}
                size="small"
                variant="default"
                onClick={() => onDraftChange(addProductModifier(draft))}
              />
            </div>
            <div className={styles.constructorRows}>
              {draft.modifiers.map((modifier, index) => (
                <div className={styles.constructorRow} key={`${modifier.order}-${index}`}>
                  <div className={styles.constructorModifierKinds}>
                    {Object.entries(modifierKindLabels).map(([kind, label]) => (
                      <button
                        key={kind}
                        className={`${styles.constructorSegmentButton} ${
                          modifier.kind === kind ? styles.constructorSegmentButtonActive : ""
                        }`}
                        type="button"
                        aria-pressed={modifier.kind === kind}
                        onClick={() =>
                          onDraftChange(
                            updateProductModifier(draft, index, {
                              kind: kind as ProductModifierKind
                            })
                          )
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    className={styles.textInput}
                    value={modifier.label}
                    placeholder={copy.modifierLabelPlaceholder}
                    onChange={(event) =>
                      onDraftChange(
                        updateProductModifier(draft, index, { label: event.currentTarget.value })
                      )
                    }
                  />
                  <label className={styles.constructorCompactField}>
                    <span className={styles.fieldLabel}>{copy.modifierPriceLabel}</span>
                    <input
                      className={styles.textInput}
                      inputMode="numeric"
                      value={minorToMajorValue(modifier.priceMinor)}
                      onChange={(event) =>
                        onDraftChange(
                          updateProductModifier(draft, index, {
                            priceMinor: majorValueToMinor(event.currentTarget.value)
                          })
                        )
                      }
                    />
                  </label>
                  <button
                    className={styles.constructorIconButton}
                    type="button"
                    aria-label={copy.removeModifierLabel}
                    onClick={() => onDraftChange(removeProductModifier(draft, index))}
                  >
                    <Icon iconName="close" width={16} height={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className={styles.constructorPreview} aria-labelledby="product-constructor-preview">
          <h3 id="product-constructor-preview" className={styles.constructorSectionTitle}>
            {copy.previewLabel}
          </h3>
          <span className={styles.constructorPreviewType}>{productCopy.types[draft.type].label}</span>
          <strong className={styles.constructorPreviewTitle}>
            {draft.title.trim() || copy.titlePlaceholder}
          </strong>
          {draft.subtitle.trim() ? (
            <p className={styles.constructorPreviewSubtitle}>{draft.subtitle}</p>
          ) : null}
          <span className={styles.fieldLabel}>{copy.previewPriceLabel}</span>
          <span className={styles.constructorPreviewPrice}>
            {formatMoneyMinor(draft.paymentModel === "free" ? 0 : draft.priceMinor, draft.currency, locale)}
          </span>
          <span className={styles.fieldLabel}>{copy.previewIncludedItemsLabel}</span>
          <ul className={styles.constructorPreviewList}>
            {draft.includedItems.map((item, index) => (
              <li key={`${item.order}-${index}`}>
                <Icon iconName={resolveProductIconName(item.icon)} width={15} height={15} aria-hidden="true" />
                <span>{item.text.trim() || copy.includedItemPlaceholder}</span>
              </li>
            ))}
          </ul>
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
        </aside>
      </form>
    </Modal>
  );
}

type CopyByValue<TValue extends string> = Record<TValue, { readonly label: string; readonly description?: string }>;

function renderSingleSelectSection<TValue extends string>({
  options,
  selectedValue,
  copyByValue,
  onSelect
}: {
  readonly options: readonly ProductConstructorOption<TValue>[];
  readonly selectedValue: TValue;
  readonly copyByValue: CopyByValue<TValue>;
  readonly onSelect: (value: TValue) => void;
}) {
  return (
    <div className={styles.constructorTileGrid}>
      {options.map((option) => (
        <SelectableTile
          key={option.value}
          className={styles.constructorTile}
          label={copyByValue[option.value].label}
          description={copyByValue[option.value].description}
          selected={selectedValue === option.value}
          icon={<Icon iconName={option.iconName} width={18} height={18} aria-hidden="true" />}
          onClick={() => onSelect(option.value)}
        />
      ))}
    </div>
  );
}

function renderMultiSelectSection<TValue extends string>({
  options,
  selectedValues,
  copyByValue,
  onToggle
}: {
  readonly options: readonly ProductConstructorOption<TValue>[];
  readonly selectedValues: readonly TValue[];
  readonly copyByValue: CopyByValue<TValue>;
  readonly onToggle: (value: TValue) => void;
}) {
  return (
    <div className={styles.constructorTileGrid}>
      {options.map((option) => (
        <SelectableTile
          key={option.value}
          className={styles.constructorTile}
          label={copyByValue[option.value].label}
          description={copyByValue[option.value].description}
          selected={selectedValues.includes(option.value)}
          icon={<Icon iconName={option.iconName} width={18} height={18} aria-hidden="true" />}
          onClick={() => onToggle(option.value)}
        />
      ))}
    </div>
  );
}

function resolveProductIconName(value: string): ProductIconName {
  return isProductIconName(value) ? value : "check";
}

function isProductIconName(value: string): value is ProductIconName {
  return (productIconNames as readonly string[]).includes(value);
}

function minorToMajorValue(value: number): string {
  return String(Math.floor(value / 100));
}

function majorValueToMinor(value: string): number {
  const normalizedValue = value.replace(/[^\d]/g, "");

  return Number(normalizedValue || 0) * 100;
}
