import { describe, expect, it } from "vitest";
import { Pin } from "./Pin.js";

describe("Pin", () => {
  it("renders the design-system pin svg icon", () => {
    const icon = Pin({ "aria-hidden": true });

    expect(icon.type).toBe("svg");
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props["aria-hidden"]).toBe(true);
    expect(icon.props.children[0].props.d).toBe(
      "M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"
    );
    expect(icon.props.children[1].props.cx).toBe(12);
    expect(icon.props.children[1].props.r).toBe(2.6);
  });
});
