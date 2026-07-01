import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonSize = "small" | "medium" | "big";

export type IconButtonVariant = "default" | "drawer" | "quiet";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  readonly label: string;
  readonly icon: ReactNode;
  readonly size?: IconButtonSize;
  readonly variant?: IconButtonVariant;
  readonly pressed?: boolean;
};
