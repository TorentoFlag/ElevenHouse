import type { ButtonHTMLAttributes, ReactNode } from "react";

export type SelectableTileProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  readonly selected?: boolean;
};
