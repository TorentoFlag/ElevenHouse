import { classNames } from "../../helpers/classNames.js";
import type { ButtonProps } from "./types.js";

export function Button({
  title,
  size = "big",
  variant = "brand",
  startIcon,
  endIcon,
  className,
  type = "button",
  ...buttonProps
}: ButtonProps) {
  const rootClassName = classNames(
    "ehButton",
    `ehButton--${size}`,
    `ehButton--${variant}`,
    className
  );

  return (
    <button {...buttonProps} className={rootClassName} type={type}>
      {Boolean(startIcon) && (
        <span className="ehButton__icon ehButton__icon--start" aria-hidden="true">
          {startIcon}
        </span>
      )}
      <span className="ehButton__title">{title}</span>
      {endIcon && (
        <span className="ehButton__icon ehButton__icon--end" aria-hidden="true">
          {endIcon}
        </span>
      )}
    </button>
  );
}
