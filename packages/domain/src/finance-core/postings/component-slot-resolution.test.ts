import { describe, expect, it } from "vitest";
import { readUnverifiedFinanceComponentSlotResolutionBindings } from "./component-slot-resolution";
import { postingDecoderEnvelope } from "./posting-test-primitives";

describe("finance component-slot resolution", () => {
  it("returns an immutable empty unverified binding set", () => {
    const result = readUnverifiedFinanceComponentSlotResolutionBindings([], postingDecoderEnvelope);

    expect(result).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
