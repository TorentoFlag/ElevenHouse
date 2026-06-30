import type { SVGProps } from "react";

export type ReferenceProps = SVGProps<SVGSVGElement>;

export function Reference(props: ReferenceProps = {}) {
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
      <rect x={3.5} y={4} width={5} height={16} rx={1.2} />
      <rect x={10} y={4} width={5} height={16} rx={1.2} />
      <path d="M17.5 5.5l3 .8-2.6 14-3-.8 2.6-14Z" />
      <path d="M3.5 9h5M10 9h5" />
    </svg>
  );
}
