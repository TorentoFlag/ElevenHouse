import type { SVGProps } from "react";

export type CalendarProps = SVGProps<SVGSVGElement>;

export function Calendar(props: CalendarProps = {}) {
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
      <rect x={4} y={5.5} width={16} height={14.5} rx={2.4} />
      <path d="M8 3.5v4" />
      <path d="M16 3.5v4" />
      <path d="M4 10h16" />
    </svg>
  );
}
