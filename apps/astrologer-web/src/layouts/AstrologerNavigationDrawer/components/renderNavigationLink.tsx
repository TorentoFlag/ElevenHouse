import type {
  NavigationDrawerItem,
  NavigationDrawerLinkProps
} from "@elevenhouse/design-system/navigation";
import { classNames } from "@elevenhouse/design-system/helpers";
import type { ReactNode } from "react";
import { NavLink } from "react-router";

export function renderNavigationLink(
  item: NavigationDrawerItem,
  { href, className, ...linkProps }: NavigationDrawerLinkProps,
  children: ReactNode
) {
  return (
    <NavLink
      {...linkProps}
      to={href ?? "#"}
      className={({ isActive }) =>
        classNames(className, {
          "ehNavigationDrawer__item--active": isActive
        })
      }
    >
      {children}
    </NavLink>
  );
}
