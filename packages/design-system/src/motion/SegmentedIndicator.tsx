import type { CSSProperties } from "react";

export type SegmentedIndicatorProps = {
  activeIndex: number;
  className?: string;
};

export function SegmentedIndicator({ activeIndex, className }: SegmentedIndicatorProps) {
  const resolvedClassName = ["ehSegmentedIndicator", className].filter(Boolean).join(" ");
  const style = {
    "--eh-motion-segmented-active-index": activeIndex
  } as CSSProperties;

  return <span aria-hidden="true" className={resolvedClassName} style={style} />;
}
