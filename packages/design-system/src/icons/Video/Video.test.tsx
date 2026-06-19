import { describe, expect, it } from "vitest";
import { Video } from "./Video.js";

describe("Video", () => {
  it("renders the design-system video svg icon", () => {
    const icon = Video();

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
      x: 2.5,
      y: 6,
      width: 13,
      height: 12,
      rx: 2.4
    });
    expect(icon.props.children[1].props.d).toBe("m15.5 10 6-3v10l-6-3");
  });
});
