import type { DictionaryEntrySourceFilter } from "@elevenhouse/contracts";
import { Chip } from "@elevenhouse/design-system/components/Chip";
import "@elevenhouse/design-system/components/Chip.css";

export type ReferenceSourceFilterChipProps = {
  readonly source: DictionaryEntrySourceFilter;
  readonly label: string;
  readonly count: number;
  readonly isActive: boolean;
  readonly onClick: () => void;
};

const sourceDotColorBySource = {
  platform: "var(--eh-color-gold)",
  modified: "var(--eh-color-gold)",
  custom: "var(--eh-color-emerald)"
} satisfies Record<Exclude<DictionaryEntrySourceFilter, "all">, string>;

export function ReferenceSourceFilterChip({
  source,
  label,
  count,
  isActive,
  onClick
}: ReferenceSourceFilterChipProps) {
  return (
    <Chip
      label={label}
      count={count}
      active={isActive}
      dotColor={source === "all" ? undefined : sourceDotColorBySource[source]}
      data-reference-source={source}
      onClick={onClick}
    />
  );
}
