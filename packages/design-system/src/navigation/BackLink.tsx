import { ArrowLeft } from "../icons/ArrowLeft.js";
import { useNavigate } from "react-router";

export type BackLinkProps = {
  readonly title: string;
  readonly path: string;
  readonly className?: string;
};

export function BackLink({ title, path, className }: BackLinkProps) {
  const navigate = useNavigate();

  return (
    <button
      aria-label={title}
      className={className}
      type="button"
      onClick={() => navigate(path)}
    >
      <ArrowLeft aria-hidden="true" />
      {title}
    </button>
  );
}
