import type { ReactElement } from "react";

export type TooltipPlacement = "top" | "right" | "bottom" | "left";

export type TooltipProps = {
  readonly children: ReactElement<Record<string, unknown>>;
  readonly content: string;
  readonly id?: string;
  readonly placement?: TooltipPlacement;
  readonly className?: string;
};
