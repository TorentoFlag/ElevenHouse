import { describe, expect, it } from "vitest";
import { NumerologyValidationError } from "./numerology-errors";
import {
  calculatePythagoreanCompatibility,
  calculatePythagoreanIndividual
} from "./pythagorean-engine";
import type { PythagoreanSettings } from "./numerology-types";

const baseSettings: PythagoreanSettings = {
  masterNumbers: { mode: "reduce_all" },
  nameNormalization: { yoPolicy: "separate", shortIPolicy: "separate" },
  includeNameNumbers: false,
  includePsychomatrix: true,
  includeStrengthLines: true,
  forecastDate: "2026-06-17"
};

describe("calculatePythagoreanIndividual", () => {
  it("calculates deterministic Pythagorean key numbers and psychomatrix", () => {
    const result = calculatePythagoreanIndividual(
      { fullName: "Мария Иванова", birthDate: "1990-03-14" },
      baseSettings
    );

    expect(result.methodCode).toBe("pythagorean");
    expect(result.methodVersion).toBe("1.0.0");
    expect(result.keyNumbers.lifePath).toBe(9);
    expect(result.keyNumbers.birthday).toBe(5);
    expect(result.keyNumbers.personalYear).toBe(9);
    expect(result.keyNumbers.personalMonth).toBe(6);
    expect(result.keyNumbers.personalDay).toBe(5);
    expect(result.psychomatrix?.cells).toEqual({
      "1": "11",
      "2": "22",
      "3": "3",
      "4": "4",
      "5": "5",
      "6": "",
      "7": "77",
      "8": "",
      "9": "999"
    });
    const goalLine = result.strengthLines.find((line) => line.code === "goal");
    expect(goalLine?.value).toBe(5);
    expect(goalLine).not.toHaveProperty("label");
  });

  it("uses numeric day first digit for single-digit birth day psychomatrix", () => {
    const result = calculatePythagoreanIndividual(
      { fullName: "Алексей Петров", birthDate: "1988-11-07" },
      baseSettings
    );

    expect(result.psychomatrix?.workingNumbers).toEqual({
      first: 35,
      second: 8,
      third: 21,
      fourth: 3
    });
    expect(result.psychomatrix?.cells).toEqual({
      "1": "1111",
      "2": "2",
      "3": "33",
      "4": "",
      "5": "5",
      "6": "",
      "7": "7",
      "8": "888",
      "9": "9"
    });
  });

  it("preserves selected master numbers for name calculations", () => {
    const result = calculatePythagoreanIndividual(
      { fullName: "Лада", birthDate: "2009-01-01" },
      {
        ...baseSettings,
        masterNumbers: { mode: "preserve_selected", values: [11] },
        includeNameNumbers: true
      }
    );

    expect(result.keyNumbers.expression).toBe(11);
  });

  it("rejects blank names and invalid ISO dates", () => {
    expect(() =>
      calculatePythagoreanIndividual({ fullName: "   ", birthDate: "1990-03-14" }, baseSettings)
    ).toThrow(NumerologyValidationError);
    expect(() =>
      calculatePythagoreanIndividual({ fullName: "Мария", birthDate: "1990-02-31" }, baseSettings)
    ).toThrow(NumerologyValidationError);
  });

  it("rejects unsupported name letters even when name numbers are disabled", () => {
    expect(() =>
      calculatePythagoreanIndividual(
        { fullName: "John", birthDate: "1990-03-14" },
        {
          ...baseSettings,
          includeNameNumbers: false,
          includePsychomatrix: false,
          includeStrengthLines: false
        }
      )
    ).toThrow(NumerologyValidationError);
  });

  it("rejects malformed top-level settings", () => {
    expect(() =>
      calculatePythagoreanIndividual(
        { fullName: "Мария", birthDate: "1990-03-14" },
        null as never
      )
    ).toThrow(NumerologyValidationError);

    expect(() =>
      calculatePythagoreanIndividual(
        { fullName: "Мария", birthDate: "1990-03-14" },
        {
          masterNumbers: { mode: "reduce_all" },
          nameNormalization: { yoPolicy: "separate", shortIPolicy: "separate" },
          includeNameNumbers: false,
          includePsychomatrix: "yes",
          includeStrengthLines: false
        } as never
      )
    ).toThrow(NumerologyValidationError);

    expect(() =>
      calculatePythagoreanIndividual(
        { fullName: "Мария", birthDate: "1990-03-14" },
        {
          masterNumbers: { mode: "reduce_all" },
          nameNormalization: { yoPolicy: "separate", shortIPolicy: "separate" },
          includeNameNumbers: false,
          includePsychomatrix: false
        } as never
      )
    ).toThrow(NumerologyValidationError);
  });
});

describe("calculatePythagoreanCompatibility", () => {
  it("calculates two participants without requiring saved individual calculations", () => {
    const result = calculatePythagoreanCompatibility(
      {
        first: { fullName: "Мария Иванова", birthDate: "1990-03-14" },
        second: { fullName: "Алексей Петров", birthDate: "1988-11-07" }
      },
      baseSettings
    );

    expect(result.individuals).toHaveLength(2);
    expect(result.pairNumber).toBe(8);
    expect(result.keyNumberComparisons.length).toBeGreaterThan(0);
    expect(result.keyNumberComparisons.map((comparison) => comparison.code)).toContain("lifePath");
    expect(result.keyNumberComparisons[0]).not.toHaveProperty("label");
    expect(result.matrixComparisons).toHaveLength(9);
    expect(result.strengthLineComparisons).toHaveLength(8);
  });

  it("computes comparison inputs when individual display blocks are disabled", () => {
    const result = calculatePythagoreanCompatibility(
      {
        first: { fullName: "Мария Иванова", birthDate: "1990-03-14" },
        second: { fullName: "Алексей Петров", birthDate: "1988-11-07" }
      },
      {
        ...baseSettings,
        includePsychomatrix: false,
        includeStrengthLines: false
      }
    );

    expect(result.matrixComparisons).toHaveLength(9);
    expect(result.strengthLineComparisons).toHaveLength(8);
    expect(result.individuals[0].psychomatrix).toBeUndefined();
    expect(result.individuals[0].strengthLines).toEqual([]);
    expect(result.individuals[1].psychomatrix).toBeUndefined();
    expect(result.individuals[1].strengthLines).toEqual([]);
    expect(
      result.strengthLineComparisons.some(
        (comparison) => comparison.valueA > 0 || comparison.valueB > 0
      )
    ).toBe(true);
    expect(result.strengthLineComparisons[0]).not.toHaveProperty("label");
  });

  it("rejects names that cannot produce both soul and personality numbers", () => {
    expect(() =>
      calculatePythagoreanIndividual(
        { fullName: "Ааа", birthDate: "1990-03-14" },
        { ...baseSettings, includeNameNumbers: true }
      )
    ).toThrow(NumerologyValidationError);

    expect(() =>
      calculatePythagoreanIndividual(
        { fullName: "Грг", birthDate: "1990-03-14" },
        { ...baseSettings, includeNameNumbers: true }
      )
    ).toThrow(NumerologyValidationError);
  });
});
