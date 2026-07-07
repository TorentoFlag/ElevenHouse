import { createElement } from "react";
import type { ElementType } from "react";
import type { LandingRevealProps } from "./types";
import { useLandingReveal } from "./useLandingReveal";

export function LandingReveal<TAs extends ElementType = "div">(revealProps: LandingRevealProps<TAs>) {
  const { as, children, className, delay = 0, variant = "rise", ...props } = revealProps;
  const Component = as ?? "div";
  const resolvedClassName = ["motion-reveal", `motion-reveal--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return createElement(
    Component,
    {
      ...props,
      className: resolvedClassName,
      "data-motion": "reveal",
      "data-motion-delay": String(delay),
      ref: useLandingReveal()
    },
    children
  );
}
