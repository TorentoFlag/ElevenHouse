import type { SVGProps } from "react";

export type ImageProps = SVGProps<SVGSVGElement>;

export function Image(props: ImageProps = {}) {
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
      <rect x={3.5} y={4} width={17} height={16} rx={2.4} />
      <circle cx={8.5} cy={9} r={1.5} />
      <path d="m5 17 4.8-4.8 3.4 3.4 2-2L19 17" />
    </svg>
  );
}
