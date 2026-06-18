import type { SVGProps } from "react";

export type SparkleProps = SVGProps<SVGSVGElement>;

export function Sparkle(props: SparkleProps = {}) {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 3c.4 3.8 2.2 5.6 6 6-3.8.4-5.6 2.2-6 6-.4-3.8-2.2-5.6-6-6 3.8-.4 5.6-2.2 6-6Z" />
      <path
        d="M19 14c.2 1.6 1 2.4 2.5 2.6-1.6.2-2.3 1-2.5 2.6-.2-1.6-1-2.4-2.5-2.6 1.6-.2 2.3-1 2.5-2.6Z"
        strokeWidth={1.3}
      />
    </svg>
  );
}
