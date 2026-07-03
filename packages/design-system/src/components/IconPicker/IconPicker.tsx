import { classNames } from "../../helpers/classNames.js";
import { Icon, type IconName } from "../../icons/Icon/index.js";
import type { IconPickerProps } from "./types.js";

export function IconPicker<TIconName extends IconName = IconName>({
  value,
  iconNames,
  ariaLabel,
  className,
  getIconAriaLabel,
  onValueChange
}: IconPickerProps<TIconName>) {
  return (
    <div className={classNames("ehIconPicker", className)} role="group" aria-label={ariaLabel}>
      {iconNames.map((iconName) => {
        const selected = iconName === value;

        return (
          <button
            key={iconName}
            className={classNames("ehIconPicker__option", {
              "ehIconPicker__option--selected": selected
            })}
            type="button"
            aria-label={getIconAriaLabel(iconName)}
            aria-pressed={selected}
            onClick={() => onValueChange(iconName)}
          >
            <Icon iconName={iconName} width={16} height={16} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
