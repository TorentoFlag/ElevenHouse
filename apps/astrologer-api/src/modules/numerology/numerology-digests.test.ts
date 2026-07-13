import { describe, expect, it } from "vitest";
import { sha256CanonicalJson, stableJson } from "./numerology-digests";

describe("numerology canonical JSON digests", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(stableJson({ z: 1, nested: { b: 2, a: 1 }, items: ["б", "а"] })).toBe(
      '{"items":["б","а"],"nested":{"a":1,"b":2},"z":1}'
    );
    expect(sha256CanonicalJson({ b: 2, a: 1 })).toBe(sha256CanonicalJson({ a: 1, b: 2 }));
    expect(sha256CanonicalJson(["а", "б"])).not.toBe(sha256CanonicalJson(["б", "а"]));
  });

  it("hashes UTF-8 values as an explicit sha256 digest", () => {
    expect(sha256CanonicalJson({ name: "Голубев Антон" })).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
