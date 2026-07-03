import type { ComponentPropsWithRef, ReactNode } from "react";

export type BreadcrumbsItem = {
  readonly id: string;
  readonly label: ReactNode;
  readonly href?: string;
  readonly isCurrent?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
};

export type BreadcrumbsProps = Omit<ComponentPropsWithRef<"nav">, "children"> & {
  readonly ariaLabel: string;
  readonly items: readonly BreadcrumbsItem[];
  readonly currentValue?: "page" | "step" | "location" | "date" | "time" | "true";
};
