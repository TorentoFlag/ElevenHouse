import { IconButton } from "../../components/IconButton/index.js";
import { classNames } from "../../helpers/classNames.js";
import { ChevronLeft } from "../../icons/ChevronLeft/index.js";
import { ChevronRight } from "../../icons/ChevronRight/index.js";
import { NavigationDrawerItem } from "./components/NavigationDrawerItem.js";
import { NavigationDrawerItemButton } from "./components/NavigationDrawerItemButton.js";
import { normalizeNavigationDrawerItem } from "./helpers/normalizeNavigationDrawerItem.js";
import type { NavigationDrawerProps } from "./types.js";

export function NavigationDrawer({
  ariaLabel,
  brand,
  items,
  footer,
  collapsed = false,
  className,
  collapseLabel,
  expandLabel,
  renderLink,
  onCollapsedChange
}: NavigationDrawerProps) {
  const collapseButtonLabel = collapsed ? expandLabel : collapseLabel;

  return (
    <aside
      className={classNames(
        "ehNavigationDrawer",
        {
          "ehNavigationDrawer--collapsed": collapsed
        },
        className
      )}
    >
      <div className="ehNavigationDrawer__brandRow">
        <div className="ehNavigationDrawer__brand">
          {brand.logo ? <span className="ehNavigationDrawer__brandLogo">{brand.logo}</span> : null}
          <span className="ehNavigationDrawer__brandText">
            <span className="ehNavigationDrawer__brandTitle">{brand.title}</span>
            {brand.subtitle ? (
              <span className="ehNavigationDrawer__brandSubtitle">{brand.subtitle}</span>
            ) : null}
          </span>
        </div>

        {!collapsed && (
          <IconButton
            className="ehNavigationDrawer__collapseButton"
            label={collapseButtonLabel}
            icon={<ChevronLeft aria-hidden="true" />}
            variant="drawer"
            size="medium"
            pressed={collapsed}
            onClick={() => onCollapsedChange?.(!collapsed)}
          />
        )}
      </div>

      {collapsed && (
        <IconButton
          className="ehNavigationDrawer__expandButton"
          label={collapseButtonLabel}
          icon={<ChevronRight aria-hidden="true" />}
          variant="drawer"
          size="medium"
          pressed={collapsed}
          onClick={() => onCollapsedChange?.(!collapsed)}
        />
      )}

      <nav className="ehNavigationDrawer__nav" aria-label={ariaLabel}>
        <div className="ehNavigationDrawer__itemList">
          {items.map((item) => {
            const normalizedItem = normalizeNavigationDrawerItem(item);

            if (typeof renderLink !== "function") {
              return <NavigationDrawerItemButton key={normalizedItem.id} item={normalizedItem} />;
            }

            return (
              <NavigationDrawerItem
                key={normalizedItem.id}
                item={normalizedItem}
                renderLink={renderLink}
              />
            );
          })}
        </div>
      </nav>

      {Boolean(footer) && <footer className="ehNavigationDrawer__footer">{footer}</footer>}
    </aside>
  );
}
