import type { CSSProperties } from "react";

export type CssVars = CSSProperties & Record<`--${string}`, string | number>;

export function cssVars(vars: CssVars): CSSProperties {
  return vars;
}
