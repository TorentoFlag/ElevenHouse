import { describe, expect, it } from "vitest";
import { reduce22 } from "./reduce22";

describe("Matrix reduce22", () => {
  it.each([
    [1, 1],
    [22, 22],
    [23, 5],
    [28, 10],
    [45, 9],
    [99, 18]
  ])("reduces %i to %i", (input, expected) => expect(reduce22(input)).toBe(expected));

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid input %s", (value) =>
    expect(() => reduce22(value)).toThrow("positive integer")
  );
});
