import type { SVGProps } from "react";

export type VideoProps = SVGProps<SVGSVGElement>;

export function Video(props: VideoProps = {}) {
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
      <rect x={2.5} y={6} width={13} height={12} rx={2.4} />
      <path d="m15.5 10 6-3v10l-6-3" />
    </svg>
  );
}
