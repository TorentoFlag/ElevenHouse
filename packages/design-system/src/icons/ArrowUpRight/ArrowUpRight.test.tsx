import { describe, expect, it } from "vitest";
import { ArrowUpRight } from "./ArrowUpRight.js";

describe("ArrowUpRight", () => {
  it("renders the design-system arrow-up-right svg icon", () => {
    const icon = ArrowUpRight({ "aria-hidden": true });

    expect(icon.type).toBe("svg");
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props["aria-hidden"]).toBe(true);
    expect(icon.props.children[0].props.d).toBe("M7 17 17 7");
    expect(icon.props.children[1].props.d).toBe("M8 7h9v9");
  });
});
