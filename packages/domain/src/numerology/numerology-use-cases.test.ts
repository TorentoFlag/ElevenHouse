import { describe, expect, it } from "vitest";
import { UnsupportedNumerologyMethodError } from "./numerology-errors";
import { calculateNumerologyIndividual } from "./numerology-use-cases";
import type { NumerologyIndividualUseCaseInput } from "./numerology-types";

describe("numerology method registry", () => {
  it("routes the only active method and rejects inactive placeholders", () => {
    expect(
      calculateNumerologyIndividual({
        methodCode: "pythagorean",
        participant: { calculationName: "Голубев Антон", birthDate: "2000-08-19" },
        periods: {}
      }).keyNumbers.lifePath
    ).toBe(2);

    expect(() =>
      calculateNumerologyIndividual({
        methodCode: "vedic",
        participant: { calculationName: "Голубев Антон", birthDate: "2000-08-19" },
        periods: {}
      } as unknown as NumerologyIndividualUseCaseInput)
    ).toThrow(UnsupportedNumerologyMethodError);
  });
});
