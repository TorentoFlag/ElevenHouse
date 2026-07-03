import { describe, expect, it } from "vitest";
import { Box } from "./Box.js";

describe("Box", () => {
  it("renders the design-system box svg icon", () => {
    const icon = Box();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(19);
    expect(icon.props.height).toBe(19);
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props.fill).toBe("none");
    expect(icon.props.stroke).toBe("currentColor");
    expect(icon.props.strokeWidth).toBe(1.6);
    expect(icon.props.strokeLinecap).toBe("round");
    expect(icon.props.strokeLinejoin).toBe("round");
    expect(icon.props.children).toHaveLength(3);
    expect(icon.props.children[0].props.d).toBe("M21 8.2 12 3 3 8.2v7.6L12 21l9-5.2V8.2Z");
    expect(icon.props.children[1].props.d).toBe("m3.3 8 8.7 5 8.7-5");
    expect(icon.props.children[2].props.d).toBe("M12 21v-8");
  });
});
