import { describe, expect, it } from "vitest";
import * as designSystem from "./index.js";

describe("design-system root exports", () => {
  it("exports public runtime APIs from the root entrypoint", () => {
    expect(designSystem.BackLink).toBeTypeOf("function");
    expect(designSystem.Button).toBeTypeOf("function");
    expect(designSystem.LanguageSwitcher).toBeTypeOf("function");
    expect(designSystem.OtpAuthForm).toBeTypeOf("function");
    expect(designSystem.Sparkle).toBeTypeOf("function");
    expect(designSystem.MotionContent).toBeTypeOf("function");
    expect(designSystem.MotionText).toBeTypeOf("function");
    expect(designSystem.classNames("root", { active: true })).toBe("root active");
  });

  it("does not export duplicated color token objects", () => {
    expect("colorTokens" in designSystem).toBe(false);
    expect("surfaceTokens" in designSystem).toBe(false);
  });
});
