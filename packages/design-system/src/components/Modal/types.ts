import type { ReactNode } from "react";

export type ModalProps = {
  readonly title: ReactNode;
  readonly right?: ReactNode;
  readonly closeLabel: string;
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly portalTarget?: Element | null;
  readonly backdropClassName?: string;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly onClose: () => void;
};
