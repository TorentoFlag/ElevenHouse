import { describe, expect, it } from "vitest";
import { Dots } from "./Dots.js";

describe("Dots", () => {
  it("renders the design-system horizontal dots svg icon", () => {
    const icon = Dots({ "aria-hidden": true });

    expect(icon.type).toBe("svg");
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props["aria-hidden"]).toBe(true);
    expect(icon.props.children).toHaveLength(3);
  });
});
