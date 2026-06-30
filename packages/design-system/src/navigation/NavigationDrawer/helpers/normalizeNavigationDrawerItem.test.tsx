import { describe, expect, it } from "vitest";
import { normalizeNavigationDrawerItem } from "./normalizeNavigationDrawerItem.js";

describe("normalizeNavigationDrawerItem", () => {
  it("normalizes optional item state into explicit resolved values", () => {
    const icon = <span data-icon="dashboard" />;

    expect(
      normalizeNavigationDrawerItem({
        id: "dashboard",
        title: "Дашборд",
        href: "/dashboard",
        icon
      })
    ).toEqual({
      id: "dashboard",
      title: "Дашборд",
      href: "/dashboard",
      icon,
      badge: null,
      active: false,
      disabled: false,
      locked: false,
      external: false,
      ariaLabel: undefined
    });
  });
});
