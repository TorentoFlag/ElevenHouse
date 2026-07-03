import type { SVGProps } from "react";
import { iconRegistry, type IconName } from "./iconRegistry.js";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  readonly iconName: IconName;
  readonly size?: SVGProps<SVGSVGElement>["width"];
};

export function Icon({ iconName, size, width, height, ...props }: IconProps) {
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

  return <IconComponent {...iconProps} />;
}
