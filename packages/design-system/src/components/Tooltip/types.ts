import type { ReactElement } from "react";

export type TooltipPlacement = "top" | "bottom";

export type TooltipProps = {
  readonly children: ReactElement<Record<string, unknown>>;
  readonly content: string;
  readonly id?: string;
  readonly placement?: TooltipPlacement;
  readonly className?: string;
};
