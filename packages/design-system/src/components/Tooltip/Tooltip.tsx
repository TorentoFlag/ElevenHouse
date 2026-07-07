import { cloneElement } from "react";
import { classNames } from "../../helpers/classNames.js";
import type { TooltipProps } from "./types.js";

export function Tooltip({
  children,
  content,
  id = "eh-tooltip",
  placement = "top",
  className
}: TooltipProps) {
  return (
    <span className={classNames("ehTooltip", `ehTooltip--${placement}`, className)}>
      {cloneElement(children, {
        "aria-describedby": id
      })}
      <span className="ehTooltip__bubble" id={id} role="tooltip">
        {content}
      </span>
    </span>
  );
}
