import { describe, expect, it } from "vitest";
import { Reference } from "./Reference.js";

describe("Reference", () => {
  it("renders the design-system reference svg icon", () => {
    const icon = Reference();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(19);
    expect(icon.props.height).toBe(19);
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props.fill).toBe("none");
    expect(icon.props.stroke).toBe("currentColor");
    expect(icon.props.strokeWidth).toBe(1.6);
    expect(icon.props.strokeLinecap).toBe("round");
    expect(icon.props.strokeLinejoin).toBe("round");
    expect(icon.props.children).toHaveLength(4);

    expect(icon.props.children[0].type).toBe("rect");
    expect(icon.props.children[0].props).toMatchObject({
      x: 3.5,
      y: 4,
      width: 5,
      height: 16,
      rx: 1.2
    });
    expect(icon.props.children[1].props).toMatchObject({
      x: 10,
      y: 4,
      width: 5,
      height: 16,
      rx: 1.2
    });
    expect(icon.props.children[2].props.d).toBe("M17.5 5.5l3 .8-2.6 14-3-.8 2.6-14Z");
    expect(icon.props.children[3].props.d).toBe("M3.5 9h5M10 9h5");
  });
});
