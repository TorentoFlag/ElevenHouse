import { classNames } from "../../helpers/classNames.js";
import type { SelectableTileProps } from "./types.js";

export function SelectableTile({
  label,
  description,
  icon,
  selected = false,
  disabled = false,
  className,
  onClick,
  type = "button",
  ...buttonProps
}: SelectableTileProps) {
  return (
    <button
      {...buttonProps}
      className={classNames(
        "ehSelectableTile",
        {
          "ehSelectableTile--selected": selected,
          "ehSelectableTile--disabled": disabled
        },
        className
      )}
      type={type}
      disabled={disabled}
      aria-pressed={selected}
      onClick={(event) => {
        if (!disabled) {
          onClick?.(event);
        }
      }}
    >
      {icon ? (
        <span className="ehSelectableTile__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="ehSelectableTile__body">
        <span className="ehSelectableTile__label">{label}</span>
        {description ? (
          <span className="ehSelectableTile__description">{description}</span>
        ) : null}
      </span>
    </button>
  );
}
