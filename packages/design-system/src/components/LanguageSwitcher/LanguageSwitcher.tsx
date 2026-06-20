import { classNames } from "../../helpers/classNames.js";
import { SegmentedIndicator } from "../../motion/index.js";
import type { LanguageSwitcherProps } from "./types.js";

export function LanguageSwitcher({
  locale,
  options,
  ariaLabel,
  className,
  onLocaleChange
}: LanguageSwitcherProps) {
  const activeLocaleIndex = Math.max(
    0,
    options.findIndex((option) => option.locale === locale)
  );

  return (
    <div className={classNames("ehLanguageSwitcher", className)} aria-label={ariaLabel}>
      <SegmentedIndicator activeIndex={activeLocaleIndex} itemCount={options.length} />
      {options.map((option) => {
        const isActive = option.locale === locale;

        return (
          <button
            key={option.locale}
            className={classNames("ehLanguageSwitcher__option", {
              "ehLanguageSwitcher__option--active": isActive
            })}
            type="button"
            aria-label={option.label}
            aria-pressed={isActive}
            onClick={() => {
              if (!isActive) {
                onLocaleChange(option.locale);
              }
            }}
          >
            {option.shortLabel}
          </button>
        );
      })}
    </div>
  );
}
