import type { ReactNode } from "react";
import styles from "../ReferencePage.module.css";

export type ReferenceCategoryButtonProps = {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly icon: ReactNode;
  readonly isActive: boolean;
  readonly onClick: () => void;
};

export function ReferenceCategoryButton({
  id,
  label,
  count,
  icon,
  isActive,
  onClick
}: ReferenceCategoryButtonProps) {
  return (
    <button
      className={`${styles.categoryButton} ${isActive ? styles.categoryButtonActive : ""}`.trim()}
      type="button"
      data-reference-category-id={id}
      onClick={onClick}
    >
      <span className={styles.categoryIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.categoryLabel}>{label}</span>
      <span className={styles.categoryCount}>{count}</span>
    </button>
  );
}
