import { describe, expect, it } from "vitest";
import { Flow } from "./Flow.js";

describe("Flow", () => {
  it("renders the design-system flow svg icon", () => {
    const icon = Flow();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(16);
    expect(icon.props.height).toBe(16);
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
      y: 3.5,
      width: 6,
      height: 5,
      rx: 1.4
    });
    expect(icon.props.children[1].props).toMatchObject({
      x: 15,
      y: 3.5,
      width: 6,
      height: 5,
      rx: 1.4
    });
    expect(icon.props.children[2].props).toMatchObject({
      x: 9,
      y: 15.5,
      width: 6,
      height: 5,
      rx: 1.4
    });
    expect(icon.props.children[3].props.d).toBe(
      "M6 8.5v3.5a2 2 0 0 0 2 2h1M18 8.5v3.5a2 2 0 0 1-2 2h-1"
    );
  });
});
