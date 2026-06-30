import { describe, expect, it } from "vitest";
import { ChevronDown } from "./ChevronDown.js";

describe("ChevronDown", () => {
  it("renders the design-system chevron down svg icon", () => {
    const icon = ChevronDown();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(16);
    expect(icon.props.height).toBe(16);
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props.fill).toBe("none");
    expect(icon.props.stroke).toBe("currentColor");
    expect(icon.props.strokeWidth).toBe(1.8);
    expect(icon.props.strokeLinecap).toBe("round");
    expect(icon.props.strokeLinejoin).toBe("round");
    expect(icon.props.children.props.d).toBe("m6 9 6 6 6-6");
  });
});
