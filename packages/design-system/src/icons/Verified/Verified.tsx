import type { SVGProps } from "react";

export type VerifiedProps = SVGProps<SVGSVGElement>;

export function Verified(props: VerifiedProps = {}) {
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
      <path
        d="M12 2.5l2.3 1.9 3-.2.9 2.9 2.5 1.7-1 2.9 1 2.9-2.5 1.7-.9 2.9-3-.2L12 21.5l-2.3-1.9-3 .2-.9-2.9-2.5-1.7 1-2.9-1-2.9 2.5-1.7.9-2.9 3 .2L12 2.5z"
        fill="currentColor"
        opacity="0.22"
      />
      <path d="M8.5 12.2l2.3 2.3 4.7-4.9" />
    </svg>
  );
}
