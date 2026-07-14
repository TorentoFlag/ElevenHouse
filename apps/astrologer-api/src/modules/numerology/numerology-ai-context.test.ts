import { describe, expect, it } from "vitest";
import {
  calculateNumerologyCompatibility,
  calculateNumerologyIndividual
} from "@elevenhouse/domain";
import { buildNumerologyAiContext } from "./numerology-ai-context";

const golubev = {
  calculationName: "Голубев Антон",
  calculationNameSource: "crm_display_name" as const,
  birthDate: "2000-08-19"
};
const koshkina = {
  calculationName: "Кошкина Яна Владимировна",
  calculationNameSource: "crm_display_name" as const,
  birthDate: "2002-03-16"
};

describe("Numerology AI context", () => {
  it("removes identity and birth data from an individual result", () => {
    const result = calculateNumerologyIndividual({
      methodCode: "pythagorean",
      participant: golubev,
      periods: { personalYear: { year: 2026 }, personalMonths: { year: 2026 } }
    });

    const context = buildNumerologyAiContext(result, "ru");
    const serialized = JSON.stringify(context);

    expect(context).toMatchObject({
      locale: "ru",
      mode: "individual",
      keyNumbers: { lifePath: 2, expression: 6 },
      psychomatrix: { cellCounts: { "1": 2, "2": 3, "8": 2 } }
    });
    expect(serialized).not.toContain("Голубев");
    expect(serialized).not.toContain("2000-08-19");
    expect(serialized).not.toContain("participant");
    expect(serialized).not.toContain("sourceDigits");
  });

  it("keeps all compatibility conclusions without either participant identity", () => {
    const result = calculateNumerologyCompatibility({
      methodCode: "pythagorean",
      participants: { first: golubev, second: koshkina },
      periods: {}
    });

    const context = buildNumerologyAiContext(result, "en");
    const serialized = JSON.stringify(context);

    expect(context).toMatchObject({
      locale: "en",
      mode: "compatibility",
      pairNumber: 7,
      conclusion: { code: "mixed" }
    });
    expect(context.mode === "compatibility" && context.comparisons).toHaveLength(22);
    expect(context.mode === "compatibility" && context.zones).toHaveLength(4);
    expect(serialized).not.toContain("Голубев");
    expect(serialized).not.toContain("Кошкина");
    expect(serialized).not.toContain("2000-08-19");
    expect(serialized).not.toContain("2002-03-16");
  });
});
