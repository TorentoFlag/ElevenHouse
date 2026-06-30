import { describe, expect, it } from "vitest";
import { LayoutGrid } from "./LayoutGrid.js";

describe("LayoutGrid", () => {
  it("renders the design-system layout grid svg icon", () => {
    const icon = LayoutGrid();

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
      x: 3,
      y: 3,
      width: 7,
      height: 7,
      rx: 1.6
    });
    expect(icon.props.children[1].props).toMatchObject({
      x: 14,
      y: 3,
      width: 7,
      height: 7,
      rx: 1.6
    });
    expect(icon.props.children[2].props).toMatchObject({
      x: 14,
      y: 14,
      width: 7,
      height: 7,
      rx: 1.6
    });
    expect(icon.props.children[3].props).toMatchObject({
      x: 3,
      y: 14,
      width: 7,
      height: 7,
      rx: 1.6
    });
  });
});
