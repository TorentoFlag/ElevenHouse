import type { CSSProperties } from "react";
import { classNames } from "../helpers/classNames.js";

export type SegmentedIndicatorProps = {
  activeIndex: number;
  className?: string;
  itemCount?: number;
};

export function SegmentedIndicator({ activeIndex, className, itemCount = 2 }: SegmentedIndicatorProps) {
  const resolvedClassName = classNames("ehSegmentedIndicator", className);
  const style = {
    "--eh-motion-segmented-active-index": activeIndex,
    "--eh-motion-segmented-count": itemCount
  } as CSSProperties;

  return <span aria-hidden="true" className={resolvedClassName} style={style} />;
}
