import { describe, expect, it } from "vitest";
import { normalizeOptionalString, normalizeRequiredString } from "./string-normalization";

describe("string normalization helpers", () => {
  it("trims required strings", () => {
    expect(normalizeRequiredString("  value  ", "Value is required")).toBe("value");
  });

  it("rejects blank required strings with the provided domain message", () => {
    expect(() => normalizeRequiredString("   ", "Value is required")).toThrow(
      "Value is required"
    );
  });

  it("trims optional strings and drops blanks", () => {
    expect(normalizeOptionalString("  value  ")).toBe("value");
    expect(normalizeOptionalString("   ")).toBeUndefined();
    expect(normalizeOptionalString(undefined)).toBeUndefined();
  });
});
