import type { CSSProperties, SVGProps } from "react";
import { iconRegistry, type IconName } from "./iconRegistry.js";

export type IconVariant = "default" | "active";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  readonly iconName: IconName;
  readonly size?: SVGProps<SVGSVGElement>["width"];
  readonly variant?: IconVariant;
};

const activeIconStyle = {
  background: "var(--eh-color-night-900)",
  borderRadius: "var(--eh-radius-12)",
  boxSizing: "content-box",
  color: "var(--eh-color-gold)",
  padding: "var(--eh-space-12)"
} satisfies CSSProperties;

export function Icon({
  iconName,
  size,
  width,
  height,
  variant = "default",
  className,
  style,
  ...props
}: IconProps) {
  const IconComponent = iconRegistry[iconName];
  const iconProps: SVGProps<SVGSVGElement> = { ...props };
  const resolvedWidth = width ?? size;
  const resolvedHeight = height ?? size;

  if (resolvedWidth !== undefined) {
    iconProps.width = resolvedWidth;
  }

  if (resolvedHeight !== undefined) {
    iconProps.height = resolvedHeight;
  }

  if (variant === "active") {
    iconProps.className = ["ehIcon", "ehIcon--active", className].filter(Boolean).join(" ");
    iconProps.style = { ...activeIconStyle, ...style };
  } else if (className) {
    iconProps.className = className;
  }

  if (variant === "default" && style) {
    iconProps.style = style;
  }

  return <IconComponent {...iconProps} />;
}
