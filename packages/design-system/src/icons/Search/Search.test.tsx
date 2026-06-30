import { describe, expect, it } from "vitest";
import { Search } from "./Search.js";

describe("Search", () => {
  it("renders the design-system search svg icon", () => {
    const icon = Search();

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
    expect(icon.props.children[0].type).toBe("circle");
    expect(icon.props.children[0].props.cx).toBe("11");
    expect(icon.props.children[0].props.cy).toBe("11");
    expect(icon.props.children[0].props.r).toBe("7");
    expect(icon.props.children[1].props.d).toBe("m20 20-3.2-3.2");
  });
});
