import type { SVGProps } from "react";

export type NumerologyProps = SVGProps<SVGSVGElement>;

export function Numerology(props: NumerologyProps = {}) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9.5 4 7.5 20" />
      <path d="M16.5 4l-2 16" />
      <path d="M5 9h15" />
      <path d="M4 15h15" />
    </svg>
  );
}
