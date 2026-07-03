import { describe, expect, it } from "vitest";
import { Close } from "./Close.js";

describe("Close", () => {
  it("renders the design-system close svg icon", () => {
    const icon = Close();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(16);
    expect(icon.props.height).toBe(16);
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props.fill).toBe("none");
    expect(icon.props.stroke).toBe("currentColor");
    expect(icon.props.strokeWidth).toBe(1.8);
    expect(icon.props.strokeLinecap).toBe("round");
    expect(icon.props.strokeLinejoin).toBe("round");
    expect(icon.props.children).toHaveLength(2);
    expect(icon.props.children[0].props.d).toBe("M18 6 6 18");
    expect(icon.props.children[1].props.d).toBe("M6 6l12 12");
  });
});
