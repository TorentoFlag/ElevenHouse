import { describe, expect, it } from "vitest";
import { resolveMatrixMethod } from "./method-registry";

describe("Matrix method registry", () => {
  it("resolves the one supported method and rejects every other code", () => {
    expect(resolveMatrixMethod("ladini_22")).toMatchObject({
      methodCode: "ladini_22",
      engineRevision: 1
    });
    expect(() => resolveMatrixMethod("custom")).toThrow("Unsupported Matrix method");
  });
});
