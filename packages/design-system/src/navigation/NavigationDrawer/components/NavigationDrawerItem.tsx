import { getNavigationItemClassName } from "../helpers/getNavigationItemClassName.js";
import type {
  NavigationDrawerLinkProps,
  NavigationDrawerResolvedItem,
  NavigationDrawerRenderLink
} from "../types.js";
import { NavigationDrawerItemButton } from "./NavigationDrawerItemButton.js";
import { NavigationDrawerItemContent } from "./NavigationDrawerItemContent.js";

type NavigationDrawerItemProps = {
  readonly item: NavigationDrawerResolvedItem;
  readonly renderLink: NavigationDrawerRenderLink;
};

export function NavigationDrawerItem({ item, renderLink }: NavigationDrawerItemProps) {
  const isUnavailable = item.disabled || item.locked;
  const itemClassName = getNavigationItemClassName(item);
  const children = <NavigationDrawerItemContent item={item} />;

  if (!isUnavailable && item.href) {
    const linkProps: NavigationDrawerLinkProps = {
      className: itemClassName,
      href: item.href,
      "data-navigation-drawer-item-id": item.id,
      ...(item.active ? { "aria-current": "page" } : {}),
      ...(item.ariaLabel ? { "aria-label": item.ariaLabel } : {}),
      ...(item.external ? { target: "_blank", rel: "noreferrer" } : {})
    };

    return renderLink(item, linkProps, children);
  }

  return <NavigationDrawerItemButton item={item} />;
}
