import type { ProductTemplateResponse, ProductType } from "@elevenhouse/contracts";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { ProductCopy } from "../../../features/products/model/productCopy";
import { getProductTypeIconName } from "../../../features/products/model/productIcons";
import { createProductTemplateSelectionModel } from "../../../features/products/model/productTemplateSelection";
import styles from "../ProductsPage.module.css";

export type ProductCreateTypeModalCopy = {
  readonly title: string;
  readonly closeLabel: string;
  readonly description: string;
  readonly loadError: string;
};

export type ProductCreateTypeModalProps = {
  readonly copy: ProductCreateTypeModalCopy;
  readonly types: ProductCopy["types"];
  readonly templates: readonly ProductTemplateResponse[];
  readonly isTemplateLoading: boolean;
  readonly isTemplateError: boolean;
  readonly isTemplateActionPending: boolean;
  readonly templateSelectionError?: string | null;
  readonly portalTarget?: Element | null;
  readonly backdropClassName?: string;
  readonly onSelectTemplate: (templateCode: string) => void | Promise<void>;
  readonly onSelect: (type: ProductType) => void;
  readonly onClose: () => void;
};

export function ProductCreateTypeModal({
  copy,
  types,
  templates,
  isTemplateLoading,
  isTemplateError,
  isTemplateActionPending,
  templateSelectionError,
  portalTarget,
  backdropClassName,
  onSelectTemplate,
  onSelect,
  onClose
}: ProductCreateTypeModalProps) {
  const selection = createProductTemplateSelectionModel(templates);
  const areTemplateCardsDisabled = isTemplateLoading || isTemplateActionPending;
  const shouldUseManualFallback = isTemplateError && selection.templates.length === 0;
  const customCopy = selection.customTemplate ?? {
    code: "custom_format",
    type: "custom",
    title: types.custom.label,
    subtitle: types.custom.description ?? null
  };
  const manualOptions = shouldUseManualFallback
    ? (
        Object.entries(types) as Array<
          [ProductType, { readonly label: string; readonly description?: string }]
        >
      ).map(([type, typeCopy]) => ({
        type,
        title: typeCopy.label,
        subtitle: typeCopy.description ?? null
      }))
    : [
        {
          type: "custom" as const,
          title: customCopy.title,
          subtitle: customCopy.subtitle
        }
      ];

  return (
    <Modal
      title={copy.title}
      closeLabel={copy.closeLabel}
      portalTarget={portalTarget}
      backdropClassName={backdropClassName}
      className={styles.productsModal}
      onClose={onClose}
    >
      <p className={styles.modalDescription}>{copy.description}</p>
      {templateSelectionError || isTemplateError ? (
        <p className={styles.modalInlineError}>{templateSelectionError ?? copy.loadError}</p>
      ) : null}
      <div className={styles.typeGrid}>
        {selection.templates.map((template) => {
          const iconName = getProductTypeIconName(template.type);

          return (
            <button
              key={template.code}
              className={styles.typeOption}
              type="button"
              data-product-template-code={template.code}
              disabled={areTemplateCardsDisabled}
              onClick={() => onSelectTemplate(template.code)}
            >
              <Icon
                iconName={iconName}
                variant="active"
                width={20}
                height={20}
                aria-hidden="true"
              />
              <span className={styles.typeOptionText}>
                <span className={styles.typeOptionTitle}>{template.title}</span>
                {template.subtitle ? (
                  <span className={styles.typeOptionDescription}>{template.subtitle}</span>
                ) : null}
              </span>
            </button>
          );
        })}
        {manualOptions.map((option) => (
          <button
            key={option.type}
            className={styles.typeOption}
            type="button"
            data-product-create-type={option.type}
            disabled={isTemplateActionPending}
            onClick={() => onSelect(option.type)}
          >
            <Icon
              iconName={getProductTypeIconName(option.type)}
              variant="active"
              width={20}
              height={20}
              aria-hidden="true"
            />
            <span className={styles.typeOptionText}>
              <span className={styles.typeOptionTitle}>{option.title}</span>
              {option.subtitle ? (
                <span className={styles.typeOptionDescription}>{option.subtitle}</span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
