import { describe, expect, it } from "vitest";
import { Bell } from "./Bell.js";

describe("Bell", () => {
  it("renders the design-system bell svg icon", () => {
    const icon = Bell();

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
    expect(icon.props.children[0].props.d).toBe("M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z");
    expect(icon.props.children[1].props.d).toBe("M10 20a2 2 0 0 0 4 0");
  });
});
