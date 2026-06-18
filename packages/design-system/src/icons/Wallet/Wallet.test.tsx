import { describe, expect, it } from "vitest";
import { Wallet } from "./Wallet.js";

describe("Wallet", () => {
  it("renders the design-system wallet svg icon", () => {
    const icon = Wallet();

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
      x: 3,
      y: 5.5,
      width: 18,
      height: 14,
      rx: 2.6
    });
    expect(icon.props.children[1].props.d).toBe("M3 9.5h18M16.5 14.5h.01");
    expect(icon.props.children[1].props.strokeWidth).toBe(2.2);
  });
});
