import { describe, expect, it } from "vitest";
import { Sparkle } from "./Sparkle.js";

describe("Sparkle", () => {
  it("renders the design-system sparkle svg icon", () => {
    const icon = Sparkle();

    expect(icon.type).toBe("svg");
    expect(icon.props.width).toBe(13);
    expect(icon.props.height).toBe(13);
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props.fill).toBe("none");
    expect(icon.props.stroke).toBe("currentColor");
    expect(icon.props.strokeWidth).toBe(1.6);
    expect(icon.props.strokeLinecap).toBe("round");
    expect(icon.props.strokeLinejoin).toBe("round");
    expect(icon.props.children).toHaveLength(2);
    expect(icon.props.children[0].props.d).toBe(
      "M12 3c.4 3.8 2.2 5.6 6 6-3.8.4-5.6 2.2-6 6-.4-3.8-2.2-5.6-6-6 3.8-.4 5.6-2.2 6-6Z"
    );
    expect(icon.props.children[1].props.d).toBe(
      "M19 14c.2 1.6 1 2.4 2.5 2.6-1.6.2-2.3 1-2.5 2.6-.2-1.6-1-2.4-2.5-2.6 1.6-.2 2.3-1 2.5-2.6Z"
    );
    expect(icon.props.children[1].props.strokeWidth).toBe(1.3);
  });
});
