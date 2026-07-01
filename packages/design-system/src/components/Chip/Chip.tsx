import type { CSSProperties } from "react";
import { classNames } from "../../helpers/classNames.js";
import type { ChipProps } from "./types.js";

export function Chip({
  label,
  count,
  active = false,
  dotColor,
  className,
  type = "button",
  ...buttonProps
}: ChipProps) {
  const dotStyle = dotColor
    ? ({
        "--eh-chip-dot-color": dotColor
      } as CSSProperties)
    : undefined;

  return (
    <button
      {...buttonProps}
      aria-pressed={buttonProps["aria-pressed"] ?? active}
      className={classNames("ehChip", { "ehChip--active": active }, className)}
      type={type}
    >
      {dotColor ? <span className="ehChip__dot" style={dotStyle} aria-hidden="true" /> : null}
      <span className="ehChip__label">{label}</span>
      {count === undefined ? null : <span className="ehChip__count">{count}</span>}
    </button>
  );
}
