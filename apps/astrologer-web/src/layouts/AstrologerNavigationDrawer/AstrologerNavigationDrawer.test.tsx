import { NavigationDrawer } from "@elevenhouse/design-system/navigation";
import { Reference } from "@elevenhouse/design-system/icons/Reference";
import { Wallet } from "@elevenhouse/design-system/icons/Wallet";
import { NavLink } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { AstrologerNavigationDrawerView } from "./components/AstrologerNavigationDrawerView";
import { renderNavigationLink } from "./components/renderNavigationLink";

describe("AstrologerNavigationDrawerView", () => {
  it("maps astrologer navigation copy to the shared navigation drawer", () => {
    const element = AstrologerNavigationDrawerView({
      copy: astrologerCopyByLocale.ru.appShell.navigation
    });

    expect(element.type).toBe(NavigationDrawer);
    expect(element.props.ariaLabel).toBe("Навигация кабинета астролога");
    expect(element.props.brand.title.props.title).toBe("ElevenHouse");
    expect(JSON.stringify(renderElement(element.props.brand.title))).toContain(
      "ehNavigationDrawer__brandTitleAccent"
    );
    expect(element.props.brand.subtitle).toBe("ASTROLOGER WORKSPACE");
    expect(element.props.collapseLabel).toBe("Свернуть боковое меню");
    expect(element.props.expandLabel).toBe("Развернуть боковое меню");
    expect(element.props.personalPage).toBeUndefined();
    expect(element.props.footerItems).toBeUndefined();
    expect(JSON.stringify(renderElement(element.props.footer))).toContain("Личная страница");
    expect(JSON.stringify(renderElement(element.props.footer))).toContain("Настройки");
    expect(element.props.items).toHaveLength(3);
    expect(element.props.items[0]).toMatchObject({
      id: "dashboard",
      title: "Дашборд",
      href: "/dashboard"
    });
    expect(element.props.items[1]).toMatchObject({
      id: "products",
      title: "Продукты",
      href: "/products"
    });
    expect(element.props.items[1].icon.type).toBe(Wallet);
    expect(element.props.items[2]).toMatchObject({
      id: "reference",
      title: "Справочники",
      href: "/reference"
    });
    expect(element.props.items[2].icon.type).toBe(Reference);
  });

  it("passes collapsed state controls to the shared navigation drawer", () => {
    const onCollapsedChange = vi.fn();
    const element = AstrologerNavigationDrawerView({
      copy: astrologerCopyByLocale.ru.appShell.navigation,
      collapsed: true,
      onCollapsedChange
    });

    expect(element.type).toBe(NavigationDrawer);
    expect(element.props.collapsed).toBe(true);
    expect(element.props.onCollapsedChange).toBe(onCollapsedChange);
  });

  it("renders drawer links through React Router NavLink", () => {
    const element = AstrologerNavigationDrawerView({
      copy: astrologerCopyByLocale.ru.appShell.navigation
    });
    const dashboardItem = element.props.items[0];
    const renderedLink = renderNavigationLink(
      dashboardItem,
      {
        className: "ehNavigationDrawer__item",
        href: "/dashboard",
        "data-navigation-drawer-item-id": "dashboard"
      },
      "Дашборд"
    );

    expect(renderedLink.type).toBe(NavLink);
    expect(renderedLink.props.to).toBe("/dashboard");
    expect(renderedLink.props.viewTransition).toBe(true);
    expect(renderedLink.props["data-navigation-drawer-item-id"]).toBe("dashboard");
    expect(renderedLink.props.className({ isActive: true })).toContain(
      "ehNavigationDrawer__item--active"
    );
    expect(renderedLink.props.className({ isActive: false })).toBe("ehNavigationDrawer__item");
  });
});

function renderElement(element: { type: unknown; props: Record<string, unknown> }) {
  if (typeof element.type !== "function") {
    return element;
  }

  return element.type(element.props);
}
