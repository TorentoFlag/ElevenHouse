import type { SVGProps } from "react";

export type MapProps = SVGProps<SVGSVGElement>;

export function Map(props: MapProps = {}) {
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
      <path d="m4 6.5 5-2 6 2 5-2v13l-5 2-6-2-5 2Z" />
      <path d="M9 4.5v13" />
      <path d="M15 6.5v13" />
    </svg>
  );
}
