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

  it("keeps typed compatibility facts but localizes explanations without identity data", () => {
    const calculated = calculateNumerologyCompatibility({
      methodCode: "pythagorean",
      participants: { first: golubev, second: koshkina },
      periods: {}
    });
    const result = {
      ...calculated,
      comparisons: calculated.comparisons.map((comparison) => ({
        ...comparison,
        explanation: "RAW key_numbers lifePath mixed"
      })),
      zones: calculated.zones.map((zone) => ({
        ...zone,
        explanation: "RAW inner_world different"
      })),
      conclusion: { ...calculated.conclusion, explanation: "RAW mixed" }
    };

    const enContext = buildNumerologyAiContext(result, "en");
    const ruContext = buildNumerologyAiContext(result, "ru");
    const serialized = JSON.stringify({ enContext, ruContext });

    expect(enContext).toMatchObject({
      locale: "en",
      mode: "compatibility",
      pairNumber: 7,
      conclusion: {
        code: "mixed",
        explanation:
          "Matches and close values — 10; differences and tensions — 12. Result: mixed compatibility."
      }
    });
    expect(enContext.mode === "compatibility" && enContext.comparisons[0]).toMatchObject({
      block: "key_numbers",
      code: "lifePath",
      explanation:
        "Life path number: 2 and 5. Difference — 3. The method classifies this as “Different”."
    });
    expect(ruContext).toMatchObject({
      locale: "ru",
      mode: "compatibility",
      conclusion: {
        code: "mixed",
        explanation:
          "Совпадения и близкие значения — 10; различия и напряжения — 12. Итог: смешанная совместимость."
      }
    });
    expect(ruContext.mode === "compatibility" && ruContext.comparisons[0]).toMatchObject({
      block: "key_numbers",
      code: "lifePath",
      explanation:
        "Число жизненного пути: 2 и 5. Разница — 3. По методике это категория «Различие»."
    });
    expect(enContext.mode === "compatibility" && enContext.comparisons).toHaveLength(22);
    expect(enContext.mode === "compatibility" && enContext.zones).toHaveLength(4);
    expect(serialized).not.toContain("RAW");
    expect(serialized).not.toContain("Голубев");
    expect(serialized).not.toContain("Кошкина");
    expect(serialized).not.toContain("2000-08-19");
    expect(serialized).not.toContain("2002-03-16");
  });
});
