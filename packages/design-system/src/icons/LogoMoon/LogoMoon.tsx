import type { SVGProps } from "react";

export type LogoMoonProps = SVGProps<SVGSVGElement>;

export function LogoMoon(props: LogoMoonProps = {}) {
  return (
    <svg
      width={34}
      height={34}
      viewBox="0 0 58 58"
      fill="none"
      {...props}
    >
      <path d="M40 8 a24 24 0 1 0 0 42 a19 19 0 0 1 0-42 Z" fill="url(#eh-logo-moon)" />
      <circle cx={46} cy={14} r={2.4} fill="#fff" opacity={0.92} />
      <defs>
        <linearGradient id="eh-logo-moon" x1={0} y1={0} x2={1} y2={1}>
          <stop stopColor="#FBF8FF" />
          <stop offset={1} stopColor="var(--eh-color-amethyst)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
