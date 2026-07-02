import type { DictionaryCategoryResponse } from "@elevenhouse/contracts";
import type { ComponentType, SVGProps } from "react";
import { Content } from "@elevenhouse/design-system/icons/Content";
import { Flow } from "@elevenhouse/design-system/icons/Flow";
import { LayoutGrid } from "@elevenhouse/design-system/icons/LayoutGrid";
import { Orbit } from "@elevenhouse/design-system/icons/Orbit";
import { Reference } from "@elevenhouse/design-system/icons/Reference";
import { Sparkle } from "@elevenhouse/design-system/icons/Sparkle";
import { ReferenceCategoryButton } from "./ReferenceCategoryButton";
import styles from "../ReferencePage.module.css";

export type ReferenceCategoryRailProps = {
  readonly allCategoriesLabel: string;
  readonly catalogTotal: number;
  readonly categories: DictionaryCategoryResponse[];
  readonly selectedCategoryId: string | null;
  readonly onCategoryChange: (categoryId: string | null) => void;
};

type ReferenceIcon = ComponentType<SVGProps<SVGSVGElement>>;

const categoryIconByCode: Record<string, ReferenceIcon> = {
  planets_in_signs: Orbit,
  signs: Orbit,
  planets_in_houses: Content,
  houses: Content,
  aspects: Flow,
  house_meanings: LayoutGrid,
  "house-mean": LayoutGrid,
  own: Sparkle,
  custom: Sparkle
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
          icon={<Reference width={16} height={16} />}
          isActive={selectedCategoryId === null}
          onClick={() => onCategoryChange(null)}
        />

        {categories.map((category) => {
          const CategoryIcon = categoryIconByCode[category.code] ?? Reference;

          return (
            <ReferenceCategoryButton
              key={category.id}
              id={category.id}
              label={category.name}
              count={category.count}
              icon={<CategoryIcon width={16} height={16} />}
              isActive={selectedCategoryId === category.id}
              onClick={() => onCategoryChange(category.id)}
            />
          );
        })}
      </nav>
    </aside>
  );
}
