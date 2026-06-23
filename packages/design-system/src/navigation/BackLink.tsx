import type { ReactNode } from "react";
import { ArrowLeft } from "../icons/ArrowLeft/index.js";
import { useNavigate } from "react-router";

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
    <button
      aria-label={resolvedAriaLabel}
      className={className}
      type="button"
      onClick={() => navigate(path)}
    >
      <ArrowLeft aria-hidden="true" />
      {title}
    </button>
  );
}
