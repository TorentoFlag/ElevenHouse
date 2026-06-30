import type { SVGProps } from "react";

export type LayoutGridProps = SVGProps<SVGSVGElement>;

export function LayoutGrid(props: LayoutGridProps = {}) {
  return (
    <svg
      width={19}
      height={19}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x={3} y={3} width={7} height={7} rx={1.6} />
      <rect x={14} y={3} width={7} height={7} rx={1.6} />
      <rect x={14} y={14} width={7} height={7} rx={1.6} />
      <rect x={3} y={14} width={7} height={7} rx={1.6} />
    </svg>
  );
}
