import { describe, expect, it } from "vitest";
import { Doc } from "./Doc.js";

describe("Doc", () => {
  it("renders the design-system document svg icon", () => {
    const icon = Doc({ "aria-hidden": true });

    expect(icon.type).toBe("svg");
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props["aria-hidden"]).toBe(true);
    expect(icon.props.children[0].props.d).toBe(
      "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
    );
    expect(icon.props.children[1].props.d).toBe("M14 3v5h5");
  });
});
