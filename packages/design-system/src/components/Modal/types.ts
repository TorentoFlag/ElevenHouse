import type { ReactNode } from "react";

export type ModalProps = {
  readonly title: string;
  readonly closeLabel: string;
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly onClose: () => void;
};
