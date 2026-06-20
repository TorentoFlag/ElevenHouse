import { describe, expect, it } from "vitest";
import { MotionContent, MotionHeight, SegmentedIndicator } from "./index.js";

describe("motion primitives", () => {
  it("renders a measured height transition frame", () => {
    const frame = (
      <MotionHeight transitionKey="register">
        <div>Register fields</div>
      </MotionHeight>
    );

    expect(frame.type).toBe(MotionHeight);
    expect(frame.props.className).toBeUndefined();
    expect(frame.props.transitionKey).toBe("register");
  });

  it("renders a content transition layer", () => {
    const content = MotionContent({
      transitionKey: "login",
      children: "Login"
    });

    expect(content.type).toBe("div");
    expect(content.key).toBe("login");
    expect(content.props.className).toBe("ehMotionContent");
  });

  it("renders a segmented control indicator style contract", () => {
    const indicator = SegmentedIndicator({
      activeIndex: 1
    });

    expect(indicator.type).toBe("span");
    expect(indicator.props.className).toBe("ehSegmentedIndicator");
    expect(indicator.props.style).toEqual({ "--eh-motion-segmented-active-index": 1 });
    expect(indicator.props["aria-hidden"]).toBe("true");
  });
});
