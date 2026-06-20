import { describe, expect, it } from "vitest";
import { MotionHeight } from "./MotionHeight.js";

describe("MotionHeight", () => {
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
});
