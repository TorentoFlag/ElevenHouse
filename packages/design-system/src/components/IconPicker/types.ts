import type { IconName } from "../../icons/Icon/index.js";

export type IconPickerProps<TIconName extends IconName = IconName> = {
  readonly value: TIconName;
  readonly iconNames: readonly TIconName[];
  readonly ariaLabel: string;
  readonly className?: string;
  readonly getIconAriaLabel: (iconName: TIconName) => string;
  readonly onValueChange: (value: TIconName) => void;
};
