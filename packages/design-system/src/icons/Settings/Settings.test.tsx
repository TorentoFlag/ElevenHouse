import { describe, expect, it } from "vitest";
import { Settings } from "./Settings.js";

describe("Settings", () => {
  it("renders the design reference settings svg icon", () => {
    const icon = Settings();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(20);
    expect(icon.props.height).toBe(20);
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props.fill).toBe("none");
    expect(icon.props.stroke).toBe("currentColor");
    expect(icon.props.strokeWidth).toBe(1.6);
    expect(icon.props.strokeLinecap).toBe("round");
    expect(icon.props.strokeLinejoin).toBe("round");
    expect(icon.props.children).toHaveLength(2);
    expect(icon.props.children[0].props.cx).toBe("12");
    expect(icon.props.children[0].props.cy).toBe("12");
    expect(icon.props.children[0].props.r).toBe("3.2");
    expect(icon.props.children[1].props.d).toBe(
      "M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3 5.6 5.6"
    );
  });
});
