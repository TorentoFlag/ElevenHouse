import { describe, expect, it } from "vitest";
import { LogoMoon } from "./LogoMoon.js";

describe("LogoMoon", () => {
  it("renders the design-system logo moon svg icon", () => {
    const icon = LogoMoon();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(34);
    expect(icon.props.height).toBe(34);
    expect(icon.props.viewBox).toBe("0 0 58 58");
    expect(icon.props.fill).toBe("none");
    expect(icon.props.children).toHaveLength(3);
    expect(icon.props.children[0].props.d).toBe("M40 8 a24 24 0 1 0 0 42 a19 19 0 0 1 0-42 Z");
    expect(icon.props.children[0].props.fill).toBe("url(#eh-logo-moon)");
    expect(icon.props.children[1].type).toBe("circle");
    expect(icon.props.children[1].props).toMatchObject({
      cx: 46,
      cy: 14,
      r: 2.4,
      fill: "#fff",
      opacity: 0.92
    });
  });
});
