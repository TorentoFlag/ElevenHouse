import type { SVGProps } from "react";

export type LightningProps = SVGProps<SVGSVGElement>;

export function Lightning(props: LightningProps = {}) {
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
      <path d="M13.5 3.5 5.5 14H12l-1.5 6.5 8-10.5H12Z" />
    </svg>
  );
}
