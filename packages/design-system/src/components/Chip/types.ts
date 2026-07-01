import type { ComponentPropsWithRef, ReactNode } from "react";

export type ChipProps = Omit<ComponentPropsWithRef<"button">, "children"> & {
  readonly label: ReactNode;
  readonly count?: ReactNode;
  readonly active?: boolean;
  readonly dotColor?: string;
};
