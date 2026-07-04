import type { ProductType } from "@elevenhouse/contracts";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { ProductCopy } from "../../../features/products/model/productCopy";
import { getProductTypeIconName } from "../../../features/products/model/productIcons";
import styles from "../ProductsPage.module.css";

const productTypeOrder: ProductType[] = [
  "single",
  "pack",
  "async",
  "sub",
  "mini",
  "course",
  "custom"
];

export type ProductCreateTypeModalCopy = {
  readonly title: string;
  readonly closeLabel: string;
  readonly description: string;
};

export type ProductCreateTypeModalProps = {
  readonly copy: ProductCreateTypeModalCopy;
  readonly types: ProductCopy["types"];
  readonly portalTarget?: Element | null;
  readonly backdropClassName?: string;
  readonly onSelect: (type: ProductType) => void;
  readonly onClose: () => void;
};

export function ProductCreateTypeModal({
  copy,
  types,
  portalTarget,
  backdropClassName,
  onSelect,
  onClose
}: ProductCreateTypeModalProps) {
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
      <div className={styles.typeGrid}>
        {productTypeOrder.map((type) => {
          const typeCopy = types[type];
          const iconName = getProductTypeIconName(type);

          return (
            <button
              key={type}
              className={styles.typeOption}
              type="button"
              data-product-create-type={type}
              onClick={() => onSelect(type)}
            >
              <Icon
                iconName={iconName}
                variant="active"
                width={20}
                height={20}
                aria-hidden="true"
              />
              <span className={styles.typeOptionText}>
                <span className={styles.typeOptionTitle}>{typeCopy.label}</span>
                {typeCopy.description ? (
                  <span className={styles.typeOptionDescription}>{typeCopy.description}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
