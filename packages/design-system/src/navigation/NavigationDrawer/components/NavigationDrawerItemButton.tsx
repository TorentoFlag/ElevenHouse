import { getNavigationItemClassName } from "../helpers/getNavigationItemClassName.js";
import type { NavigationDrawerResolvedItem } from "../types.js";
import { NavigationDrawerItemContent } from "./NavigationDrawerItemContent.js";

type NavigationDrawerItemButtonProps = {
  readonly item: NavigationDrawerResolvedItem;
};

export function NavigationDrawerItemButton({ item }: NavigationDrawerItemButtonProps) {
  const isUnavailable = item.disabled || item.locked;

  return (
    <button
      key={item.id}
      className={getNavigationItemClassName(item)}
      type="button"
      disabled={item.disabled}
      aria-disabled={isUnavailable}
      aria-label={item.ariaLabel}
      data-navigation-drawer-item-id={item.id}
    >
      <NavigationDrawerItemContent item={item} />
    </button>
  );
}
