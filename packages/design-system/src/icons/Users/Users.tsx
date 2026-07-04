import type { SVGProps } from "react";

export type UsersProps = SVGProps<SVGSVGElement>;

export function Users(props: UsersProps = {}) {
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
      <circle cx={9} cy={8.5} r={3} />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M15 6a3 3 0 0 1 0 5.5" />
      <path d="M17 15a5 5 0 0 1 3.5 4" />
    </svg>
  );
}
