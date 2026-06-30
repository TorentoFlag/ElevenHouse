import { describe, expect, it } from "vitest";
import { Verified } from "./Verified.js";

describe("Verified", () => {
  it("renders the design-system verified svg icon", () => {
    const icon = Verified();

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
    expect(icon.props.children[0].props.d).toBe(
      "M12 2.5l2.3 1.9 3-.2.9 2.9 2.5 1.7-1 2.9 1 2.9-2.5 1.7-.9 2.9-3-.2L12 21.5l-2.3-1.9-3 .2-.9-2.9-2.5-1.7 1-2.9-1-2.9 2.5-1.7.9-2.9 3 .2L12 2.5z"
    );
    expect(icon.props.children[0].props.fill).toBe("currentColor");
    expect(icon.props.children[0].props.opacity).toBe("0.22");
    expect(icon.props.children[1].props.d).toBe("M8.5 12.2l2.3 2.3 4.7-4.9");
  });
});
