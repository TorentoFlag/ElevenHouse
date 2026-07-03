import type { NavigationDrawerItem } from "@elevenhouse/design-system/navigation";
import { Box } from "@elevenhouse/design-system/icons/Box";
import { Chat } from "@elevenhouse/design-system/icons/Chat";
import { Content } from "@elevenhouse/design-system/icons/Content";
import { Flow } from "@elevenhouse/design-system/icons/Flow";
import { Orbit } from "@elevenhouse/design-system/icons/Orbit";
import { Reference } from "@elevenhouse/design-system/icons/Reference";
import type { ReactNode } from "react";
import type {
  AppShellNavigationItemCopy,
  AppShellNavigationItemId
} from "../../../common/i18n/astrologerCopy";
import { LayoutGrid } from "@elevenhouse/design-system";

const iconByNavigationItemId = {
  dashboard: <LayoutGrid width={20} height={20} aria-hidden="true" />,
  analytics: <Flow width={20} height={20} aria-hidden="true" />,
  calendar: <Content width={20} height={20} aria-hidden="true" />,
  clients: <Chat width={20} height={20} aria-hidden="true" />,
  products: <Box width={20} height={20} aria-hidden="true" />,
  funnels: <Flow width={20} height={20} aria-hidden="true" />,
  chartEngine: <Orbit width={20} height={20} aria-hidden="true" />,
  numerology: <Content width={20} height={20} aria-hidden="true" />,
  destinyMatrix: <Orbit width={20} height={20} aria-hidden="true" />,
  humanDesign: <Flow width={20} height={20} aria-hidden="true" />,
  astroCalendar: <Orbit width={20} height={20} aria-hidden="true" />,
  astroDiary: <Content width={20} height={20} aria-hidden="true" />,
  reference: <Reference width={20} height={20} aria-hidden="true" />,
  settings: <Orbit width={20} height={20} aria-hidden="true" />
} satisfies Record<AppShellNavigationItemId, ReactNode>;

export function toNavigationDrawerItem(item: AppShellNavigationItemCopy): NavigationDrawerItem {
  return {
    ...item,
    icon: iconByNavigationItemId[item.id]
  };
}

export function createPersonalPageIcon() {
  return <Flow width={20} height={20} aria-hidden="true" />;
}
