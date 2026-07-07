import type { SVGProps } from "react";
import type { IconName } from "../content/landingContent";

type IconProps = SVGProps<SVGSVGElement> & {
  readonly name: IconName;
  readonly size?: number;
};

const paths: Record<IconName, readonly string[]> = {
  ai: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"],
  box: ["M4 8l8-4 8 4-8 4-8-4z", "M4 8v8l8 4 8-4V8", "M12 12v8"],
  calendar: ["M7 3v4", "M17 3v4", "M4 8h16", "M5 5h14v15H5z"],
  chart: ["M4 19V5", "M4 19h16", "M8 16v-5", "M12 16V8", "M16 16v-8"],
  chat: ["M5 6h14v9H9l-4 4V6z"],
  check: ["M5 12l4 4L19 6"],
  chevD: ["M6 9l6 6 6-6"],
  chevR: ["M9 6l6 6-6 6"],
  content: ["M5 4h14v16H5z", "M8 8h8", "M8 12h8", "M8 16h5"],
  flow: ["M6 6h5v5H6z", "M13 13h5v5h-5z", "M11 8h3a3 3 0 013 3v2", "M9 11v2a3 3 0 003 3h1"],
  globe: ["M12 3a9 9 0 100 18 9 9 0 000-18z", "M3 12h18", "M12 3c3 3 3 15 0 18", "M12 3c-3 3-3 15 0 18"],
  library: ["M4 5h4v14H4z", "M10 5h4v14h-4z", "M16 5h4v14h-4z"],
  moon: ["M18 15.5A8 8 0 118.5 6 6.5 6.5 0 0018 15.5z"],
  num: ["M7 5h10", "M7 12h10", "M9 3L7 21", "M17 3l-2 18"],
  orbit: [
    "M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0",
    "M3 12c3-5 15-5 18 0-3 5-15 5-18 0z",
    "M6 5c5 1 11 8 12 14",
    "M18 5C13 6 7 13 6 19"
  ],
  play: ["M8 5v14l11-7L8 5z"],
  spark: ["M12 2l2.1 6 6 2.1-6 2.1-2.1 6-2.1-6-6-2.1 6-2.1L12 2z"],
  star: ["M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9L12 3z"],
  users: ["M9 11a3 3 0 100-6 3 3 0 000 6z", "M3 20a6 6 0 0112 0", "M16 11a2.5 2.5 0 100-5", "M16 14a5 5 0 015 5"],
  wallet: ["M4 7h15v12H4z", "M4 7l3-3h12v3", "M15 13h4"]
};

export function Icon({ name, size = 18, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {paths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}
