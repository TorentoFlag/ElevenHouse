import type { ProductConstructorSectionProps } from "../types";
import { ProductConstructorScenarioSections } from "./ProductConstructorScenarioSections";
import styles from "../ProductConstructorModal.module.css";

export function ProductConstructorEditor(props: ProductConstructorSectionProps) {
  return (
    <div className={styles.productConstructorEditor} data-product-constructor-editor="true">
      <ProductConstructorScenarioSections {...props} />
    </div>
  );
}
