import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type PopoverAlign = "start" | "end";

export type PopoverOpenChangeReason = "trigger" | "outside-pointer" | "escape";

export type PopoverProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean, reason: PopoverOpenChangeReason) => void;
};

export type PopoverTriggerProps = ComponentPropsWithoutRef<"button">;

export type PopoverContentProps = Omit<ComponentPropsWithoutRef<"div">, "id"> & {
  readonly align?: PopoverAlign;
};
