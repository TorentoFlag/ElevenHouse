import { classNames } from "../../helpers/classNames.js";
import { SegmentedIndicator } from "../../motion/index.js";
import type { SegmentedTabsProps } from "./types.js";

export function SegmentedTabs<TValue extends string = string>({
  value,
  options,
  ariaLabel,
  className,
  onValueChange
}: SegmentedTabsProps<TValue>) {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );

  return (
    <div className={classNames("ehSegmentedTabs", className)} role="tablist" aria-label={ariaLabel}>
      <SegmentedIndicator activeIndex={activeIndex} itemCount={options.length} />
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            className={classNames("ehSegmentedTabs__tab", {
              "ehSegmentedTabs__tab--active": isActive
            })}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              if (!isActive) {
                onValueChange(option.value);
              }
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
