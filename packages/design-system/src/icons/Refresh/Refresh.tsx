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
      <path d="M20 7v5h-5" />
      <path d="M19.2 13A7.8 7.8 0 1 1 17 5.5L20 8.5" />
    </svg>
  );
}
