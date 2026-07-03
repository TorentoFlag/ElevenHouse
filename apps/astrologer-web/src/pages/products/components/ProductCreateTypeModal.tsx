import type { ProductType } from "@elevenhouse/contracts";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { Icon, type IconName } from "@elevenhouse/design-system/icons/Icon";
import type { ProductCopy } from "../../../features/products/model/productCopy";
import styles from "../ProductsPage.module.css";

const productTypeOrder: ProductType[] = ["single", "pack", "async", "sub", "mini", "course", "custom"];

const productTypeIcons = {
  single: "video",
  pack: "wallet",
  async: "content",
  sub: "flow",
  mini: "chat",
  course: "layoutGrid",
  custom: "plus"
} satisfies Record<ProductType, IconName>;

export type ProductCreateTypeModalCopy = {
  readonly title: string;
  readonly closeLabel: string;
  readonly description: string;
};

export type ProductCreateTypeModalProps = {
  readonly copy: ProductCreateTypeModalCopy;
  readonly types: ProductCopy["types"];
  readonly onSelect: (type: ProductType) => void;
  readonly onClose: () => void;
};

export function ProductCreateTypeModal({
  copy,
  types,
  onSelect,
  onClose
}: ProductCreateTypeModalProps) {
  return (
    <Modal
      title={copy.title}
      closeLabel={copy.closeLabel}
      className={styles.productsModal}
      onClose={onClose}
    >
      <p className={styles.modalDescription}>{copy.description}</p>
      <div className={styles.typeGrid}>
        {productTypeOrder.map((type) => {
          const typeCopy = types[type];
          const iconName = productTypeIcons[type];

          return (
            <button
              key={type}
              className={styles.typeOption}
              type="button"
              data-product-create-type={type}
              onClick={() => onSelect(type)}
            >
              <Icon iconName={iconName} variant="active" width={20} height={20} aria-hidden="true" />
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
