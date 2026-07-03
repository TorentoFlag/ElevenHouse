import type { SVGProps } from "react";

export type BoxProps = SVGProps<SVGSVGElement>;

export function Box(props: BoxProps = {}) {
  return (
    <svg
      width={19}
      height={19}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 8.2 12 3 3 8.2v7.6L12 21l9-5.2V8.2Z" />
      <path d="m3.3 8 8.7 5 8.7-5" />
      <path d="M12 21v-8" />
    </svg>
  );
}
