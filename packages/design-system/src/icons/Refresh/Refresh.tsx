import type { SVGProps } from "react";

export type RefreshProps = SVGProps<SVGSVGElement>;

export function Refresh(props: RefreshProps = {}) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 3v5h-5" />
      <path d="M20.5 12A8.5 8.5 0 1 1 18 6L21 8" />
    </svg>
  );
}
