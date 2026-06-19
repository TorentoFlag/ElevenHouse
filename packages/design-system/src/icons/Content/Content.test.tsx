import { describe, expect, it } from "vitest";
import { Content } from "./Content.js";

describe("Content", () => {
  it("renders the design-system content svg icon", () => {
    const icon = Content();

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
    expect(icon.props.children[0].type).toBe("rect");
    expect(icon.props.children[0].props).toMatchObject({
      x: 4,
      y: 3,
      width: 16,
      height: 18,
      rx: 2.4
    });
    expect(icon.props.children[1].props.d).toBe("M8 8h8M8 12h8M8 16h5");
  });
});
