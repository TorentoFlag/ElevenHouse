import { describe, expect, it } from "vitest";
import { NumerologyValidationError } from "../../numerology-errors";
import { calculateNameNumbers, normalizeCalculationName } from "./name-numbers";

describe("Pythagorean RU name numbers", () => {
  it("calculates approved Russian fixtures with Ё and Й kept distinct", () => {
    expect(calculateNameNumbers("Голубев Антон")).toEqual({
      expression: 6,
      soul: 6,
      personality: 9
    });
    expect(calculateNameNumbers("Кошкина Яна Владимировна")).toEqual({
      expression: 7,
      soul: 9,
      personality: 7
    });
    expect(normalizeCalculationName("Алёна Йогина")).toContain("ё");
    expect(normalizeCalculationName("Алёна Йогина")).toContain("й");
  });

  it.each(["Anton", "Антон2", "Антон🙂"])("rejects unsupported name %s", (name) => {
    expect(() => calculateNameNumbers(name)).toThrow(NumerologyValidationError);
  });

  it.each(["Ббр", "Ааа"])("requires both vowels and consonants in %s", (name) => {
    expect(() => calculateNameNumbers(name)).toThrow(NumerologyValidationError);
  });
});
