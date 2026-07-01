import { createElement } from "react";
import { classNames } from "../../helpers/classNames.js";
import type { CardElement, CardProps } from "./types.js";

export function Card<TElement extends CardElement = "div">({
  as,
  padding = "medium",
  variant = "default",
  className,
  ...cardProps
}: CardProps<TElement>) {
  const Component = as ?? "div";
  const rootClassName = classNames("ehCard", `ehCard--${padding}`, `ehCard--${variant}`, className);

  return createElement(Component, {
    ...cardProps,
    className: rootClassName
  });
}
