import { describe, expect, it } from "vitest";
import { MotionRouteContent } from "./MotionRouteContent.js";

describe("MotionRouteContent", () => {
  it("renders a keyed page transition layer for routed content", () => {
    const content = MotionRouteContent({
      transitionKey: "/reference",
      children: "Reference"
    });

    expect(content.type).toBe("div");
    expect(content.key).toBe("/reference");
    expect(content.props.className).toBe("ehMotionRouteContent ehMotionRouteContent--fallback");
    expect(content.props.style).toMatchObject({
      viewTransitionName: "eh-page"
    });
  });

  it("allows a custom view transition name for nested route groups", () => {
    const content = MotionRouteContent({
      transitionKey: "settings",
      viewTransitionName: "eh-settings-page",
      className: "settingsRoute",
      children: "Settings"
    });

    expect(content.props.className).toBe(
      "ehMotionRouteContent ehMotionRouteContent--fallback settingsRoute"
    );
    expect(content.props.style).toMatchObject({
      viewTransitionName: "eh-settings-page"
    });
  });
});
