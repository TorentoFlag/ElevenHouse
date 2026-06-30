import { describe, expect, it } from "vitest";
import { Plus } from "./Plus.js";

describe("Plus", () => {
  it("renders the design-system plus svg icon", () => {
    const icon = Plus();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(16);
    expect(icon.props.height).toBe(16);
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props.fill).toBe("none");
    expect(icon.props.stroke).toBe("currentColor");
    expect(icon.props.strokeWidth).toBe(1.8);
    expect(icon.props.strokeLinecap).toBe("round");
    expect(icon.props.strokeLinejoin).toBe("round");
    expect(icon.props.children.props.d).toBe("M12 5v14M5 12h14");
  });
});
