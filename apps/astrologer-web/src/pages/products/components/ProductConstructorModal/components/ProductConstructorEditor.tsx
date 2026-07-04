import type { ProductConstructorSectionProps } from "../types";
import {
  AccessGrantsSection,
  BasicProductSections,
  ClientDataSection,
  MethodsSection
} from "./sections/BasicProductSections";
import { IncludedItemsSection } from "./sections/IncludedItemsSection";
import { ModifiersSection } from "./sections/ModifiersSection";
import styles from "../ProductConstructorModal.module.css";

export function ProductConstructorEditor(props: ProductConstructorSectionProps) {
  return (
    <div className={styles.productConstructorEditor} data-product-constructor-editor="true">
      <BasicProductSections {...props} />
      <MethodsSection {...props} />
      <ClientDataSection {...props} />
      <AccessGrantsSection {...props} />
      <ModifiersSection {...props} />
      <IncludedItemsSection {...props} />
    </div>
  );
}
