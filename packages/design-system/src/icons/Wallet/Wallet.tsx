import type { SVGProps } from "react";

export type WalletProps = SVGProps<SVGSVGElement>;

export function Wallet(props: WalletProps = {}) {
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
      <rect x={3} y={5.5} width={18} height={14} rx={2.6} />
      <path d="M3 9.5h18M16.5 14.5h.01" strokeWidth={2.2} />
    </svg>
  );
}
