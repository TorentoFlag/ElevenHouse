import { describe, expect, it } from "vitest";
import {
  canonicalizeHumanDesignChecksumPayload,
  createHumanDesignResultChecksum
} from "./result-checksum";

describe("Human Design result checksum", () => {
  it("canonicalizes object keys recursively", () => {
    expect(
      canonicalizeHumanDesignChecksumPayload({
        z: 1,
        a: { d: 4, c: 3 },
        b: true
      })
    ).toBe('{"a":{"c":3,"d":4},"b":true,"z":1}');
  });

  it("returns the same checksum for objects with different insertion order", () => {
    const first = createHumanDesignResultChecksum({ b: 2, a: { d: 4, c: 3 } });
    const second = createHumanDesignResultChecksum({ a: { c: 3, d: 4 }, b: 2 });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      algorithm: "sha256",
      canonicalization: "json-stable-v1"
    });
    expect(first.value).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("keeps array order significant", () => {
    expect(createHumanDesignResultChecksum({ gates: [41, 31, 34, 20] })).not.toEqual(
      createHumanDesignResultChecksum({ gates: [41, 34, 31, 20] })
    );
  });

  it("ignores existing resultChecksum fields when hashing", () => {
    expect(createHumanDesignResultChecksum({ resultChecksum: { value: "old" }, a: 1 })).toEqual(
      createHumanDesignResultChecksum({ a: 1 })
    );
  });

  it("rejects non-finite numbers", () => {
    expect(() => createHumanDesignResultChecksum({ value: Number.NaN })).toThrow(
      "Human Design checksum payload number must be finite"
    );
  });
});
