import type { NavigationDrawerResolvedItem } from "../types.js";

type NavigationDrawerItemContentProps = {
  readonly item: NavigationDrawerResolvedItem;
};

export function NavigationDrawerItemContent({ item }: NavigationDrawerItemContentProps) {
  return (
    <>
      <span className="ehNavigationDrawer__itemIcon" aria-hidden="true">
        {item.icon}
      </span>
      <span className="ehNavigationDrawer__itemTitle">{item.title}</span>
      {Boolean(item.badge) && <span className="ehNavigationDrawer__badge">{item.badge}</span>}
    </>
  );
}
