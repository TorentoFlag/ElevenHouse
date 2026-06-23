import { MotionContent, MotionHeight } from "@elevenhouse/design-system/motion";
import { describe, expect, it } from "vitest";
import { AuthStepMotion } from "./AuthStepMotion";
import styles from "./AuthPage.module.css";

describe("AuthStepMotion", () => {
  it("uses the auth step as the height and content transition key", () => {
    const frame = AuthStepMotion({
      step: "code",
      children: <div>Code form</div>
    });
    const content = frame.props.children;

    expect(frame.type).toBe(MotionHeight);
    expect(frame.props.transitionKey).toBe("code");
    expect(frame.props.className).toBe(styles.authStepMotionFrame);
    expect(content.type).toBe(MotionContent);
    expect(content.props.transitionKey).toBe("code");
    expect(content.props.className).toBe(styles.authStepMotionContent);
  });
});
