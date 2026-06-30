import { describe, expect, it } from "vitest";
import { getNavigationItemClassName } from "./getNavigationItemClassName.js";
import type { NavigationDrawerResolvedItem } from "../types.js";

describe("getNavigationItemClassName", () => {
  it("returns base and state classes for navigation drawer items", () => {
    expect(
      getNavigationItemClassName(
        createResolvedItem({
          active: true,
          disabled: true,
          locked: true
        })
      )
    ).toBe(
      "ehNavigationDrawer__item ehNavigationDrawer__item--active ehNavigationDrawer__item--disabled ehNavigationDrawer__item--locked"
    );
  });
});

function createResolvedItem(
  overrides: Partial<NavigationDrawerResolvedItem> = {}
): NavigationDrawerResolvedItem {
  return {
    id: "dashboard",
    title: "Дашборд",
    href: "/dashboard",
    icon: "icon",
    badge: null,
    active: false,
    disabled: false,
    locked: false,
    external: false,
    ariaLabel: undefined,
    ...overrides
  };
}
