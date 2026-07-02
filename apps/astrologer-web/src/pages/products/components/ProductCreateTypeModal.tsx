import type { ReactElement, SVGProps } from "react";
import type { ProductType } from "@elevenhouse/contracts";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { Chat } from "@elevenhouse/design-system/icons/Chat";
import { Content } from "@elevenhouse/design-system/icons/Content";
import { Flow } from "@elevenhouse/design-system/icons/Flow";
import { LayoutGrid } from "@elevenhouse/design-system/icons/LayoutGrid";
import { Plus } from "@elevenhouse/design-system/icons/Plus";
import { Video } from "@elevenhouse/design-system/icons/Video";
import { Wallet } from "@elevenhouse/design-system/icons/Wallet";
import type { ProductCopy } from "../../../features/products/model/productCopy";
import styles from "../ProductsPage.module.css";

const productTypeOrder: ProductType[] = ["single", "pack", "async", "sub", "mini", "course", "custom"];

const productTypeIcons = {
  single: Video,
  pack: Wallet,
  async: Content,
  sub: Flow,
  mini: Chat,
  course: LayoutGrid,
  custom: Plus
} satisfies Record<ProductType, (props: SVGProps<SVGSVGElement>) => ReactElement>;

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
          const Icon = productTypeIcons[type];

          return (
            <button
              key={type}
              className={styles.typeOption}
              type="button"
              data-product-create-type={type}
              onClick={() => onSelect(type)}
            >
              <span className={styles.typeOptionIcon} aria-hidden="true">
                <Icon width={18} height={18} />
              </span>
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
