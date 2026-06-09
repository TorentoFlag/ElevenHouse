import { describe, expect, it } from "vitest";
import { isSupportedLocale } from "./index";

describe("isSupportedLocale", () => {
  it("accepts launch locales", () => {
    expect(isSupportedLocale("ru")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
  });

  it("rejects unsupported locales", () => {
    expect(isSupportedLocale("de")).toBe(false);
  });
});
