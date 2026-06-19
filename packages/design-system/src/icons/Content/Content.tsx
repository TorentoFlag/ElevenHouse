import type { SVGProps } from "react";

export type ContentProps = SVGProps<SVGSVGElement>;

export function Content(props: ContentProps = {}) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x={4} y={3} width={16} height={18} rx={2.4} />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}
