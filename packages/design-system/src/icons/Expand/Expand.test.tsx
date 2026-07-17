import { describe, expect, it } from "vitest";
import { Expand } from "./Expand.js";

describe("Expand", () => {
  it("renders the maximize-style four-corner glyph", () => {
    const icon = Expand({ "aria-hidden": true });

    expect(icon.type).toBe("svg");
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props["aria-hidden"]).toBe(true);
    expect(icon.props.children.map((child: { props: { d: string } }) => child.props.d)).toEqual([
      "M8 3H3v5",
      "M16 3h5v5",
      "M21 16v5h-5",
      "M3 16v5h5"
    ]);
  });
});
