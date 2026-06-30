import type { NavigationDrawerItem, NavigationDrawerResolvedItem } from "../types.js";

export function normalizeNavigationDrawerItem(
  item: NavigationDrawerItem
): NavigationDrawerResolvedItem {
  return {
    id: item.id,
    title: item.title,
    href: item.href,
    icon: item.icon,
    badge: item.badge ?? null,
    active: item.active === true,
    disabled: item.disabled === true,
    locked: item.locked === true,
    external: item.external === true,
    ariaLabel: item.ariaLabel
  };
}
