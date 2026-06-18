import { describe, expect, it } from "vitest";
import { ArrowLeft } from "./ArrowLeft.js";

describe("ArrowLeft", () => {
  it("renders the design-system arrow-left svg icon", () => {
    const icon = ArrowLeft();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(15);
    expect(icon.props.height).toBe(15);
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props.fill).toBe("none");
    expect(icon.props.stroke).toBe("currentColor");
    expect(icon.props.strokeWidth).toBe(1.6);
    expect(icon.props.strokeLinecap).toBe("round");
    expect(icon.props.strokeLinejoin).toBe("round");
    expect(icon.props.children.type).toBe("path");
    expect(icon.props.children.props.d).toBe("m15 18-6-6 6-6");
  });
});
