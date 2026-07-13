import type { ComponentPropsWithRef, ReactNode } from "react";

export type ActionMenuItemTone = "default" | "danger";

export type ActionMenuItem = {
  readonly id: string;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
  readonly tone?: ActionMenuItemTone;
  readonly onSelect: () => void;
};

export type ActionMenuAlign = "start" | "end";

export type ActionMenuProps = Omit<ComponentPropsWithRef<"div">, "children"> & {
  readonly label: ReactNode;
  readonly items: readonly ActionMenuItem[];
  readonly align?: ActionMenuAlign;
  readonly disabled?: boolean;
  readonly menuClassName?: string;
  readonly itemClassName?: string;
  readonly triggerAriaLabel?: string;
  readonly showChevron?: boolean;
};
