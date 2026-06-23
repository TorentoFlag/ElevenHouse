import { Flow } from "@elevenhouse/design-system/icons/Flow";
import { Wallet } from "@elevenhouse/design-system/icons/Wallet";
import { Orbit } from "@elevenhouse/design-system/icons/Orbit";
import type { AuthVisualHighlightKey } from "../../common/i18n/astrologerCopy";
import type { ComponentType, SVGProps } from "react";

type HighlightIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const authHighlightIcons: Record<AuthVisualHighlightKey, HighlightIcon> = {
  charts: Orbit,
  automation: Flow,
  commerce: Wallet
};
