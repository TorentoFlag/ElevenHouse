import { describe, expect, it } from "vitest";
import { nonEmptyStringSchema } from "./index";

describe("nonEmptyStringSchema", () => {
  it("trims and accepts non-empty strings", () => {
    expect(nonEmptyStringSchema.parse(" ElevenHouse ")).toBe("ElevenHouse");
  });

  it("rejects empty strings", () => {
    expect(() => nonEmptyStringSchema.parse("   ")).toThrow();
  });
});
