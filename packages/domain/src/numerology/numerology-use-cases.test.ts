import { describe, expect, it } from "vitest";
import { NumerologyValidationError } from "./numerology-errors";
import { calculateNumerologyIndividual } from "./numerology-use-cases";
import type { NumerologyIndividualUseCaseInput, PythagoreanSettings } from "./numerology-types";

const settings: PythagoreanSettings = {
  masterNumbers: { mode: "reduce_all" },
  nameNormalization: { yoPolicy: "separate", shortIPolicy: "separate" },
  includeNameNumbers: false,
  includePsychomatrix: false,
  includeStrengthLines: false
};

describe("numerology use cases", () => {
  it("rejects unsupported future methods at runtime", () => {
    expect(() =>
      calculateNumerologyIndividual({
        methodCode: "vedic",
        participant: { fullName: "Мария", birthDate: "1990-03-14" },
        settings
      } as unknown as NumerologyIndividualUseCaseInput)
    ).toThrow(new NumerologyValidationError("Unsupported numerology method"));
  });
});
