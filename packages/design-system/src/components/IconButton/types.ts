import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonSize = "small" | "medium";

export type IconButtonVariant = "default" | "drawer";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  readonly label: string;
  readonly icon: ReactNode;
  readonly size?: IconButtonSize;
  readonly variant?: IconButtonVariant;
  readonly pressed?: boolean;
};
