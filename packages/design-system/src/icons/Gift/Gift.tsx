import type { SVGProps } from "react";

export type GiftProps = SVGProps<SVGSVGElement>;

export function Gift(props: GiftProps = {}) {
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
      <rect x={4} y={9} width={16} height={11} rx={2} />
      <path d="M3.5 9h17" />
      <path d="M12 9v11" />
      <path d="M12 9H8.8a2.2 2.2 0 1 1 2.2-2.2V9Z" />
      <path d="M12 9h3.2A2.2 2.2 0 1 0 13 6.8V9Z" />
    </svg>
  );
}
