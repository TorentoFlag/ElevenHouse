import type { SVGProps } from "react";

export type OrbitProps = SVGProps<SVGSVGElement>;

export function Orbit(props: OrbitProps = {}) {
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
      <circle cx={12} cy={12} r={3} />
      <path d="M5.2 8.5C2.8 10 1.5 11.9 2.2 13.4c1 2.2 6.3 2 11.8-.4S23.4 6.3 22.4 4.1c-.7-1.5-3-1.7-5.9-.8" />
    </svg>
  );
}
