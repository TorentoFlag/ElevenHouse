import { describe, expect, it } from "vitest";
import { MotionText } from "./MotionText.js";

describe("MotionText", () => {
  it("renders a keyed inline text transition layer", () => {
    const text = MotionText({
      transitionKey: "ru:title",
      children: "Создать кабинет"
    });

    expect(text.type).toBe("span");
    expect(text.key).toBe("ru:title");
    expect(text.props.className).toBe("ehMotionText");
    expect(text.props.children).toBe("Создать кабинет");
  });
});
