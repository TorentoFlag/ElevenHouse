export type SegmentedTabsOption<TValue extends string = string> = {
  value: TValue;
  label: string;
};

export type SegmentedTabsProps<TValue extends string = string> = {
  value: TValue;
  options: readonly SegmentedTabsOption<TValue>[];
  ariaLabel: string;
  className?: string;
  onValueChange: (value: TValue) => void;
};
