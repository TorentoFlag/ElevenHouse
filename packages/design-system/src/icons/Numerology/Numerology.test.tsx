import { describe, expect, it } from "vitest";
import { Numerology } from "./Numerology.js";

describe("Numerology", () => {
  it("renders the design reference numerology svg icon", () => {
    const icon = Numerology();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(20);
    expect(icon.props.height).toBe(20);
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props.fill).toBe("none");
    expect(icon.props.stroke).toBe("currentColor");
    expect(icon.props.strokeWidth).toBe(1.6);
    expect(icon.props.strokeLinecap).toBe("round");
    expect(icon.props.strokeLinejoin).toBe("round");
    expect(icon.props.children).toHaveLength(4);
    expect(icon.props.children[0].props.d).toBe("M9.5 4 7.5 20");
    expect(icon.props.children[1].props.d).toBe("M16.5 4l-2 16");
    expect(icon.props.children[2].props.d).toBe("M5 9h15");
    expect(icon.props.children[3].props.d).toBe("M4 15h15");
  });
});
