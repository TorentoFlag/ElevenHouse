import { describe, expect, it } from "vitest";
import { Trash } from "./Trash.js";

describe("Trash", () => {
  it("renders the design-system trash svg icon", () => {
    const icon = Trash();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(16);
    expect(icon.props.height).toBe(16);
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props.fill).toBe("none");
    expect(icon.props.stroke).toBe("currentColor");
    expect(icon.props.strokeWidth).toBe(1.8);
    expect(icon.props.strokeLinecap).toBe("round");
    expect(icon.props.strokeLinejoin).toBe("round");
    expect(icon.props.children.map((child: { props: { d: string } }) => child.props.d)).toEqual([
      "M3 6h18",
      "M8 6V4h8v2",
      "M19 6l-1 14H6L5 6",
      "M10 11v5",
      "M14 11v5"
    ]);
  });
});
