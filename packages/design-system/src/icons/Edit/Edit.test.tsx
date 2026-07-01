import { describe, expect, it } from "vitest";
import { Edit } from "./Edit.js";

describe("Edit", () => {
  it("renders the design-system edit svg icon", () => {
    const icon = Edit();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(16);
    expect(icon.props.height).toBe(16);
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props.fill).toBe("none");
    expect(icon.props.stroke).toBe("currentColor");
    expect(icon.props.strokeWidth).toBe(1.8);
    expect(icon.props.strokeLinecap).toBe("round");
    expect(icon.props.strokeLinejoin).toBe("round");
    expect(icon.props.children[0].props.d).toBe("M12 20h9");
    expect(icon.props.children[1].props.d).toBe("M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z");
  });
});
