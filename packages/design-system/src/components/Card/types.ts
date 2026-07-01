import type { ComponentPropsWithRef, ReactNode } from "react";

export type CardElement = "article" | "div" | "section";
export type CardPadding = "small" | "medium" | "large";
export type CardVariant = "default" | "elevated" | "outlined";

export type CardProps<TElement extends CardElement = "div"> = Omit<
  ComponentPropsWithRef<TElement>,
  "as"
> & {
  readonly as?: TElement;
  readonly children?: ReactNode;
  readonly padding?: CardPadding;
  readonly variant?: CardVariant;
};
