import { describe, expect, it } from "vitest";
import { classNames } from "./classNames.js";

describe("classNames", () => {
  it("joins string classes and ignores empty values", () => {
    expect(classNames("base", null, undefined, false, "", "active")).toBe("base active");
  });

  it("supports conditional class maps", () => {
    expect(
      classNames("button", {
        "button--active": true,
        "button--disabled": false
      })
    ).toBe("button button--active");
  });

  it("flattens nested class arrays", () => {
    expect(classNames("root", ["child", ["deep", null]])).toBe("root child deep");
  });
});
