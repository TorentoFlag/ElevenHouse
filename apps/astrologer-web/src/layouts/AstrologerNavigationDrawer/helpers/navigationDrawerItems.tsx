import type { NavigationDrawerItem } from "@elevenhouse/design-system/navigation";
import type { ReactNode } from "react";
import type {
  AppShellNavigationItemCopy,
  AppShellNavigationItemId
} from "../../../common/i18n/astrologerCopy";
import { Icon } from "@elevenhouse/design-system/icons/Icon";

const iconByNavigationItemId = {
  dashboard: <Icon iconName="layoutGrid" width={20} height={20} aria-hidden="true" />,
  analytics: <Icon iconName="flow" width={20} height={20} aria-hidden="true" />,
  calendar: <Icon iconName="content" width={20} height={20} aria-hidden="true" />,
  clients: <Icon iconName="chat" width={20} height={20} aria-hidden="true" />,
  products: <Icon iconName="box" width={20} height={20} aria-hidden="true" />,
  funnels: <Icon iconName="flow" width={20} height={20} aria-hidden="true" />,
  chartEngine: <Icon iconName="orbit" width={20} height={20} aria-hidden="true" />,
  numerology: <Icon iconName="numerology" width={20} height={20} aria-hidden="true" />,
  destinyMatrix: <Icon iconName="orbit" width={20} height={20} aria-hidden="true" />,
  humanDesign: <Icon iconName="flow" width={20} height={20} aria-hidden="true" />,
  astroCalendar: <Icon iconName="orbit" width={20} height={20} aria-hidden="true" />,
  astroDiary: <Icon iconName="content" width={20} height={20} aria-hidden="true" />,
  reference: <Icon iconName="reference" width={20} height={20} aria-hidden="true" />,
  settings: <Icon iconName="settings" width={20} height={20} aria-hidden="true" />
} satisfies Record<AppShellNavigationItemId, ReactNode>;

export function toNavigationDrawerItem(item: AppShellNavigationItemCopy): NavigationDrawerItem {
  return {
    ...item,
    icon: iconByNavigationItemId[item.id]
  };
}

export function createPersonalPageIcon() {
  return <Icon iconName="flow" width={20} height={20} aria-hidden="true" />;
}
