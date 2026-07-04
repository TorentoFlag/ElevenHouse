import type { SVGProps } from "react";

export type ClockProps = SVGProps<SVGSVGElement>;

export function Clock(props: ClockProps = {}) {
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
      <circle cx={12} cy={12} r={8.5} />
      <path d="M12 7.5V12l3.2 2" />
    </svg>
  );
}
