import type { SVGProps } from "react";

export type PinProps = SVGProps<SVGSVGElement>;

export function Pin(props: PinProps = {}) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx={12} cy={10} r={2.6} />
    </svg>
  );
}
