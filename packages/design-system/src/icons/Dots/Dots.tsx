import type { SVGProps } from "react";

export type DotsProps = SVGProps<SVGSVGElement>;

export function Dots(props: DotsProps = {}) {
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
      <circle cx={5} cy={12} r={1.15} fill="currentColor" stroke="none" />
      <circle cx={12} cy={12} r={1.15} fill="currentColor" stroke="none" />
      <circle cx={19} cy={12} r={1.15} fill="currentColor" stroke="none" />
    </svg>
  );
}
