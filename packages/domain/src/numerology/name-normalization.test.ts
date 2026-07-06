import { describe, expect, it } from "vitest";
import { NumerologyValidationError } from "./numerology-errors";
import { normalizeNumerologyName } from "./name-normalization";

describe("normalizeNumerologyName", () => {
  it("keeps yo and short i separate when configured", () => {
    expect(
      normalizeNumerologyName(" Анна-Мария О'Коннор. ", {
        yoPolicy: "separate",
        shortIPolicy: "separate"
      })
    ).toBe("аннамарияоконнор");
  });

  it("folds yo and short i when configured", () => {
    expect(
      normalizeNumerologyName("Семён Майский", {
        yoPolicy: "as_e",
        shortIPolicy: "as_i"
      })
    ).toBe("семенмаискии");
  });

  it("folds final short i when configured", () => {
    expect(
      normalizeNumerologyName("Сергей", {
        yoPolicy: "separate",
        shortIPolicy: "as_i"
      })
    ).toBe("сергеи");
  });

  it("normalizes decomposed yo before applying policies", () => {
    expect(
      normalizeNumerologyName("Семе\u0308н", {
        yoPolicy: "separate",
        shortIPolicy: "separate"
      })
    ).toBe("семён");
  });

  it("rejects malformed normalization policies", () => {
    expect(() =>
      normalizeNumerologyName("Семён", {
        yoPolicy: "future_policy",
        shortIPolicy: "separate"
      } as never)
    ).toThrow(NumerologyValidationError);
    expect(() =>
      normalizeNumerologyName("Сергей", {
        yoPolicy: "separate",
        shortIPolicy: "future_policy"
      } as never)
    ).toThrow(NumerologyValidationError);
  });
});
