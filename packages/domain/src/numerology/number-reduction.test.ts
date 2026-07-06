import { describe, expect, it } from "vitest";
import { NumerologyValidationError } from "./numerology-errors";
import { reduceNumber } from "./number-reduction";

describe("reduceNumber", () => {
  it("reduces all intermediate values to one digit", () => {
    expect(reduceNumber(29, { mode: "reduce_all" })).toBe(2);
  });

  it("preserves selected master numbers", () => {
    expect(reduceNumber(29, { mode: "preserve_selected", values: [11] })).toBe(11);
  });

  it("reduces unselected master numbers", () => {
    expect(reduceNumber(33, { mode: "preserve_selected", values: [11, 22] })).toBe(6);
  });

  it("rejects unsupported selected master numbers", () => {
    expect(() =>
      reduceNumber(29, { mode: "preserve_selected", values: [29 as 11] })
    ).toThrow(NumerologyValidationError);
  });

  it("rejects malformed master number settings", () => {
    expect(() => reduceNumber(29, { mode: "future_mode" } as never)).toThrow(
      NumerologyValidationError
    );
    expect(() =>
      reduceNumber(29, { mode: "preserve_selected" } as never)
    ).toThrow(NumerologyValidationError);
  });
});
