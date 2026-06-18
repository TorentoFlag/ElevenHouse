import { describe, expect, it } from "vitest";
import { Orbit } from "./Orbit.js";

describe("Orbit", () => {
  it("renders the design-system orbit svg icon", () => {
    const icon = Orbit();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(16);
    expect(icon.props.height).toBe(16);
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props.fill).toBe("none");
    expect(icon.props.stroke).toBe("currentColor");
    expect(icon.props.strokeWidth).toBe(1.6);
    expect(icon.props.strokeLinecap).toBe("round");
    expect(icon.props.strokeLinejoin).toBe("round");
    expect(icon.props.children).toHaveLength(2);
    expect(icon.props.children[0].type).toBe("circle");
    expect(icon.props.children[0].props.cx).toBe(12);
    expect(icon.props.children[0].props.cy).toBe(12);
    expect(icon.props.children[0].props.r).toBe(3);
    expect(icon.props.children[1].props.d).toBe(
      "M5.2 8.5C2.8 10 1.5 11.9 2.2 13.4c1 2.2 6.3 2 11.8-.4S23.4 6.3 22.4 4.1c-.7-1.5-3-1.7-5.9-.8"
    );
  });
});
