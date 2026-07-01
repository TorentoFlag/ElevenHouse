import { classNames } from "../../helpers/classNames.js";
import type { IconButtonProps } from "./types.js";

export function IconButton({
  label,
  icon,
  size = "big",
  variant = "default",
  pressed,
  className,
  type = "button",
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      {...buttonProps}
      className={classNames(
        "ehIconButton",
        `ehIconButton--${size}`,
        `ehIconButton--${variant}`,
        {
          "ehIconButton--pressed": pressed === true
        },
        className
      )}
      type={type}
      aria-label={label}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
    >
      <span className="ehIconButton__icon" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}
