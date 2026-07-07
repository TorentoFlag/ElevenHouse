import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

export type LandingRevealVariant = "fade" | "lift" | "rise" | "scale" | "slide";

type LandingRevealOwnProps<TAs extends ElementType> = {
  readonly as?: TAs;
  readonly children: ReactNode;
  readonly delay?: number;
  readonly variant?: LandingRevealVariant;
};

export type LandingRevealProps<TAs extends ElementType = "div"> = LandingRevealOwnProps<TAs> &
  Omit<ComponentPropsWithoutRef<TAs>, keyof LandingRevealOwnProps<TAs> | "ref">;
