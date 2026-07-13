import { describe, expect, it } from "vitest";
import { NumerologyValidationError } from "../../numerology-errors";
import { reduceFully, reduceScalar } from "./reduction";

describe("Pythagorean RU reduction", () => {
  it("preserves scalar master numbers but fully reduces matrix numbers", () => {
    expect(reduceScalar(11)).toBe(11);
    expect(reduceScalar(22)).toBe(22);
    expect(reduceScalar(33)).toBe(33);
    expect(reduceScalar(38)).toBe(11);
    expect(reduceFully(11)).toBe(2);
    expect(reduceFully(99)).toBe(9);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid reduction input %s",
    (value) => expect(() => reduceScalar(value)).toThrow(NumerologyValidationError)
  );
});
