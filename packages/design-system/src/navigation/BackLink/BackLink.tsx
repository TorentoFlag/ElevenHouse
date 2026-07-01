import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button/index.js";
import { ArrowLeft } from "../../icons/ArrowLeft/index.js";

export type BackLinkProps = {
  readonly title: ReactNode;
  readonly path: string;
  readonly className?: string;
  readonly ariaLabel?: string;
};

export function BackLink({ title, path, className, ariaLabel }: BackLinkProps) {
  const navigate = useNavigate();
  const resolvedAriaLabel = ariaLabel ?? (typeof title === "string" ? title : undefined);

  return (
    <Button
      aria-label={resolvedAriaLabel}
      className={className}
      title={title}
      type="button"
      variant="default"
      size="medium"
      startIcon={<ArrowLeft aria-hidden="true" />}
      onClick={() => navigate(path)}
    />
  );
}
