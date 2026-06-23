import type { ReactNode } from "react";

export type SegmentedTabsOption<TValue extends string = string> = {
  value: TValue;
  label: ReactNode;
};

export type SegmentedTabsProps<TValue extends string = string> = {
  value: TValue;
  options: readonly SegmentedTabsOption<TValue>[];
  ariaLabel: string;
  className?: string;
  onValueChange: (value: TValue) => void;
};
