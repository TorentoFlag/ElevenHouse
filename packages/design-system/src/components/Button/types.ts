import type { ComponentPropsWithRef, ReactNode } from "react";

export type ButtonSize = "small" | "medium";
export type ButtonVariant = "brand" | "default";

export type ButtonProps = Omit<ComponentPropsWithRef<"button">, "children" | "title"> & {
  title: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
};
