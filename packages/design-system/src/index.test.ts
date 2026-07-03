import { describe, expect, it } from "vitest";
import * as designSystem from "./index.js";

describe("design-system root exports", () => {
  it("exports public runtime APIs from the root entrypoint", () => {
    expect(designSystem.BackLink).toBeTypeOf("function");
    expect(designSystem.Bell).toBeTypeOf("function");
    expect(designSystem.Box).toBeTypeOf("function");
    expect(designSystem.Button).toBeTypeOf("function");
    expect(designSystem.ChevronDown).toBeTypeOf("function");
    expect(designSystem.ChevronLeft).toBeTypeOf("function");
    expect(designSystem.ChevronRight).toBeTypeOf("function");
    expect(designSystem.LanguageSwitcher).toBeTypeOf("function");
    expect(designSystem.LayoutGrid).toBeTypeOf("function");
    expect(designSystem.OtpAuthForm).toBeTypeOf("function");
    expect(designSystem.Plus).toBeTypeOf("function");
    expect(designSystem.Reference).toBeTypeOf("function");
    expect(designSystem.Search).toBeTypeOf("function");
    expect(designSystem.Sparkle).toBeTypeOf("function");
    expect(designSystem.Verified).toBeTypeOf("function");
    expect(designSystem.MotionContent).toBeTypeOf("function");
    expect(designSystem.MotionRouteContent).toBeTypeOf("function");
    expect(designSystem.MotionText).toBeTypeOf("function");
    expect(designSystem.classNames("root", { active: true })).toBe("root active");
  });

  it("does not export duplicated color token objects", () => {
    expect("colorTokens" in designSystem).toBe(false);
    expect("surfaceTokens" in designSystem).toBe(false);
  });
});
