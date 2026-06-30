import { classNames } from "../../../helpers/classNames.js";
import type { NavigationDrawerResolvedItem } from "../types.js";

export function getNavigationItemClassName(item: NavigationDrawerResolvedItem) {
  return classNames("ehNavigationDrawer__item", {
    "ehNavigationDrawer__item--active": item.active,
    "ehNavigationDrawer__item--disabled": item.disabled,
    "ehNavigationDrawer__item--locked": item.locked
  });
}
