import { describe, expect, it } from "vitest";
import { normalizeNumerologyName } from "./name-normalization";

describe("normalizeNumerologyName", () => {
  it("keeps yo and short i separate when configured", () => {
    expect(
      normalizeNumerologyName(" Анна-Мария О'Коннор. ", {
        yoPolicy: "separate",
        shortIpolicy: "separate"
      })
    ).toBe("аннамарияоконнор");
  });

  it("folds yo and short i when configured", () => {
    expect(
      normalizeNumerologyName("Семён Майский", {
        yoPolicy: "as_e",
        shortIpolicy: "as_i"
      })
    ).toBe("семенмаиский");
  });
});
