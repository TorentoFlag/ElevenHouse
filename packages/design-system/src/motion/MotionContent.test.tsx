import { describe, expect, it } from "vitest";
import { MotionContent } from "./MotionContent.js";

describe("MotionContent", () => {
  it("renders a keyed content transition layer", () => {
    const content = MotionContent({
      transitionKey: "login",
      children: "Login"
    });

    expect(content.type).toBe("div");
    expect(content.key).toBe("login");
    expect(content.props.className).toBe("ehMotionContent");
  });
});
