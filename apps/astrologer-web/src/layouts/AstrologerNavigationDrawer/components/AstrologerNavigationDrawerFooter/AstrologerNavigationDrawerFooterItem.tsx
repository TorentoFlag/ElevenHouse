import { classNames } from "@elevenhouse/design-system/helpers";
import type { NavigationDrawerItem } from "@elevenhouse/design-system/navigation";
import { renderNavigationLink } from "../renderNavigationLink";

type AstrologerNavigationDrawerFooterItemProps = {
  item: NavigationDrawerItem;
};

export function AstrologerNavigationDrawerFooterItem({
  item
}: AstrologerNavigationDrawerFooterItemProps) {
  return renderNavigationLink(
    item,
    {
      className: classNames("ehNavigationDrawer__item", {
        "ehNavigationDrawer__item--active": item.active === true,
        "ehNavigationDrawer__item--disabled": item.disabled === true,
        "ehNavigationDrawer__item--locked": item.locked === true
      }),
      href: item.href,
      "data-navigation-drawer-item-id": item.id,
      ...(item.active ? { "aria-current": "page" } : {}),
      ...(item.ariaLabel ? { "aria-label": item.ariaLabel } : {}),
      ...(item.external ? { target: "_blank", rel: "noreferrer" } : {})
    },
    <>
      {item.icon ? (
        <span className="ehNavigationDrawer__itemIcon" aria-hidden="true">
          {item.icon}
        </span>
      ) : null}
      <span className="ehNavigationDrawer__itemTitle">{item.title}</span>
      {item.badge ? <span className="ehNavigationDrawer__badge">{item.badge}</span> : null}
    </>
  );
}
