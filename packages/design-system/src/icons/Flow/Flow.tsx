import type { SVGProps } from "react";

export type FlowProps = SVGProps<SVGSVGElement>;

export function Flow(props: FlowProps = {}) {
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
      <rect x={3} y={3.5} width={6} height={5} rx={1.4} />
      <rect x={15} y={3.5} width={6} height={5} rx={1.4} />
      <rect x={9} y={15.5} width={6} height={5} rx={1.4} />
      <path d="M6 8.5v3.5a2 2 0 0 0 2 2h1M18 8.5v3.5a2 2 0 0 1-2 2h-1" />
    </svg>
  );
}
