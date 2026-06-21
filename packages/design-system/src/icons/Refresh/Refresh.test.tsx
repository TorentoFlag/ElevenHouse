import { describe, expect, it } from "vitest";
import { Refresh } from "./Refresh.js";

describe("Refresh", () => {
  it("renders the design-system refresh svg icon", () => {
    const icon = Refresh();

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
    expect(icon.props.children[0].props.d).toBe("M20 7v5h-5");
    expect(icon.props.children[1].props.d).toBe(
      "M19.2 13A7.8 7.8 0 1 1 17 5.5L20 8.5"
    );
  });
});
