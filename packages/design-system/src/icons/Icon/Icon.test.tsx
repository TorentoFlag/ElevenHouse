import { describe, expect, it } from "vitest";
import { Icon } from "./Icon.js";
import { iconRegistry } from "./iconRegistry.js";

describe("Icon", () => {
  it("renders the icon matching iconName", () => {
    const icon = Icon({ iconName: "video" });
    const svg = iconRegistry.video(icon.props);

    expect(icon.type).toBe(iconRegistry.video);
    expect(svg.type).toBe("svg");
    expect(svg.props.viewBox).toBe("0 0 24 24");
    expect(svg.props.width).toBe(16);
    expect(svg.props.height).toBe(16);
    expect(svg.props.children[0].type).toBe("rect");
    expect(svg.props.children[0].props).toMatchObject({
      x: 2.5,
      y: 6,
      width: 13,
      height: 12,
      rx: 2.4
    });
    expect(svg.props.children[1].props.d).toBe("m15.5 10 6-3v10l-6-3");
  });

  it("forwards svg props and applies size when width and height are omitted", () => {
    const icon = Icon({
      iconName: "bell",
      size: 20,
      "aria-hidden": true,
      className: "notificationIcon"
    });

    expect(icon.props.width).toBe(20);
    expect(icon.props.height).toBe(20);
    expect(icon.props["aria-hidden"]).toBe(true);
    expect(icon.props.className).toBe("notificationIcon");
  });

  it("renders the active variant on the svg without replacing explicit dimensions", () => {
    const icon = Icon({
      iconName: "box",
      variant: "active",
      width: 20,
      height: 20,
      className: "catalogIcon"
    });

    expect(icon.type).toBe(iconRegistry.box);
    expect(icon.props.width).toBe(20);
    expect(icon.props.height).toBe(20);
    expect(icon.props.className).toBe("ehIcon ehIcon--active catalogIcon");
    expect(icon.props.style).toMatchObject({
      background: "var(--eh-color-gold-alpha-14)",
      borderRadius: "var(--eh-radius-12)",
      boxSizing: "content-box",
      color: "var(--eh-color-gold)",
      padding: "var(--eh-space-7)"
    });
  });

  it("lets explicit width and height override size", () => {
    const icon = Icon({ iconName: "box", size: 20, width: 18, height: 22 });

    expect(icon.props.width).toBe(18);
    expect(icon.props.height).toBe(22);
  });

  it("keeps the supported icon names in the registry", () => {
    expect(Object.keys(iconRegistry).sort()).toEqual([
      "arrowLeft",
      "arrowUpRight",
      "bell",
      "box",
      "calendar",
      "chat",
      "check",
      "chevronDown",
      "chevronLeft",
      "chevronRight",
      "clock",
      "close",
      "content",
      "doc",
      "dots",
      "edit",
      "expand",
      "fileDown",
      "flow",
      "gift",
      "globe",
      "image",
      "layoutGrid",
      "lightning",
      "logoMoon",
      "map",
      "mic",
      "numerology",
      "orbit",
      "pin",
      "plus",
      "reference",
      "refresh",
      "search",
      "settings",
      "sparkle",
      "star",
      "trash",
      "users",
      "verified",
      "video",
      "wallet"
    ]);
  });
});
