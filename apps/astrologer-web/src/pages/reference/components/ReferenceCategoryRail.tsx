import type { DictionaryCategoryResponse } from "@elevenhouse/contracts";
import { Icon, type IconName } from "@elevenhouse/design-system/icons/Icon";
import { ReferenceCategoryButton } from "./ReferenceCategoryButton";
import styles from "../ReferencePage.module.css";

export type ReferenceCategoryRailProps = {
  readonly allCategoriesLabel: string;
  readonly catalogTotal: number;
  readonly categories: DictionaryCategoryResponse[];
  readonly selectedCategoryId: string | null;
  readonly onCategoryChange: (categoryId: string | null) => void;
};

const categoryIconByCode: Record<string, IconName> = {
  planets_in_signs: "orbit",
  signs: "orbit",
  planets_in_houses: "content",
  houses: "content",
  aspects: "flow",
  house_meanings: "layoutGrid",
  "house-mean": "layoutGrid",
  own: "sparkle",
  custom: "sparkle"
};

export function ReferenceCategoryRail({
  allCategoriesLabel,
  catalogTotal,
  categories,
  selectedCategoryId,
  onCategoryChange
}: ReferenceCategoryRailProps) {
  return (
    <aside className={styles.categoryRail} aria-label={allCategoriesLabel}>
      <nav className={styles.categoryList}>
        <ReferenceCategoryButton
          id="all"
          label={allCategoriesLabel}
          count={catalogTotal}
          icon={<Icon iconName="reference" width={16} height={16} />}
          isActive={selectedCategoryId === null}
          onClick={() => onCategoryChange(null)}
        />

        {categories.map((category) => {
          const iconName = categoryIconByCode[category.code] ?? "reference";

          return (
            <ReferenceCategoryButton
              key={category.id}
              id={category.id}
              label={category.name}
              count={category.count}
              icon={<Icon iconName={iconName} width={16} height={16} />}
              isActive={selectedCategoryId === category.id}
              onClick={() => onCategoryChange(category.id)}
            />
          );
        })}
      </nav>
    </aside>
  );
}
