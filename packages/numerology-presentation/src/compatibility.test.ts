import { describe, expect, it } from "vitest";
import type {
  NumerologyComparison,
  NumerologyCompatibilityConclusion,
  NumerologyCompatibilityZone
} from "@elevenhouse/contracts";
import {
  formatNumerologyComparison,
  formatNumerologyConclusion,
  formatNumerologyZone,
  getNumerologyComparisonIndicatorLabel,
  getNumerologyCompatibilityLabels
} from "./compatibility";

const comparison: NumerologyComparison = {
  block: "key_numbers",
  code: "lifePath",
  valueA: 2,
  valueB: 5,
  difference: 3,
  relation: "different",
  explanation: "RAW key_numbers lifePath mixed"
};

const zone: NumerologyCompatibilityZone = {
  code: "identity",
  comparisonCodes: [
    "key_numbers:lifePath",
    "key_numbers:birthday",
    "key_numbers:expression"
  ],
  counts: { match: 1, close: 1, different: 1, tension: 0 },
  relation: "different",
  explanation: "RAW identity different"
};

const conclusion: NumerologyCompatibilityConclusion = {
  code: "mixed",
  matchAndClose: 10,
  differentAndTension: 12,
  tension: 5,
  explanation: "RAW mixed"
};

describe("numerology compatibility presentation", () => {
  it("formats Russian audit facts from structured comparison values", () => {
    expect(formatNumerologyComparison(comparison, "ru")).toBe(
      "Число жизненного пути: 2 и 5. Разница — 3. По методике это категория «Различие»."
    );
    expect(formatNumerologyZone(zone, "ru")).toBe(
      "Идентичность. Сравнений: 3. Итоговая категория: «Различие». Совпадения: 1; близкие значения: 1; различия: 1; напряжения: 0."
    );
    expect(formatNumerologyConclusion(conclusion, "ru")).toBe(
      "Совпадения и близкие значения — 10; различия и напряжения — 12. Итог: смешанная совместимость."
    );
  });

  it("formats English audit facts from the same structured values", () => {
    expect(formatNumerologyComparison(comparison, "en")).toBe(
      "Life path number: 2 and 5. Difference — 3. The method classifies this as “Different”."
    );
    expect(formatNumerologyZone(zone, "en")).toBe(
      "Identity. Comparisons: 3. Overall category: “Different”. Matches: 1; close values: 1; differences: 1; tensions: 0."
    );
    expect(formatNumerologyConclusion(conclusion, "en")).toBe(
      "Matches and close values — 10; differences and tensions — 12. Result: mixed compatibility."
    );
  });

  it("owns complete canonical RU and EN compatibility catalogs", () => {
    expect(getNumerologyCompatibilityLabels("ru")).toMatchObject({
      blockLabels: {
        key_numbers: "Ключевые числа",
        psychomatrix: "Психоматрица",
        strength_lines: "Линии силы",
        total: "Всего"
      },
      relationLabels: {
        match: "Совпадение",
        close: "Близкие значения",
        different: "Различие",
        tension: "Напряжение"
      },
      zoneLabels: {
        identity: "Идентичность",
        inner_world: "Внутренний мир",
        resources: "Ресурсы",
        dynamics: "Динамика"
      },
      conclusionLabels: {
        harmonious: "Гармоничная совместимость",
        mixed: "Смешанная совместимость",
        attention: "Совместимость требует внимания"
      }
    });
    expect(getNumerologyCompatibilityLabels("en")).toMatchObject({
      blockLabels: {
        key_numbers: "Core numbers",
        psychomatrix: "Psychomatrix",
        strength_lines: "Strength lines",
        total: "Total"
      },
      relationLabels: {
        match: "Match",
        close: "Close values",
        different: "Different",
        tension: "Tension"
      },
      zoneLabels: {
        identity: "Identity",
        inner_world: "Inner world",
        resources: "Resources",
        dynamics: "Dynamics"
      },
      conclusionLabels: {
        harmonious: "Harmonious compatibility",
        mixed: "Mixed compatibility",
        attention: "Compatibility requires attention"
      }
    });
  });

  it("labels every canonical indicator and psychomatrix digit", () => {
    const expected = {
      lifePath: ["Число жизненного пути", "Life path number"],
      birthday: ["Число дня рождения", "Birthday number"],
      expression: ["Число выражения", "Expression number"],
      soul: ["Число души", "Soul number"],
      personality: ["Число личности", "Personality number"],
      goal: ["Целеустремлённость", "Purpose"],
      family: ["Семейность", "Family"],
      stability: ["Стабильность", "Stability"],
      self_esteem: ["Самооценка", "Self-esteem"],
      material: ["Быт и материальность", "Material life"],
      talent: ["Талант", "Talent"],
      spirituality: ["Духовность", "Spirituality"],
      temperament: ["Темперамент", "Temperament"]
    } as const;

    for (const [code, labels] of Object.entries(expected)) {
      const item: NumerologyComparison = {
        ...comparison,
        block: code in getNumerologyCompatibilityLabels("ru").lineLabels
          ? "strength_lines"
          : "key_numbers",
        code
      };
      expect(getNumerologyComparisonIndicatorLabel(item, "ru")).toBe(labels[0]);
      expect(getNumerologyComparisonIndicatorLabel(item, "en")).toBe(labels[1]);
    }

    expect(
      getNumerologyComparisonIndicatorLabel(
        { ...comparison, block: "psychomatrix", code: "digit_7" },
        "ru"
      )
    ).toBe("Удача · цифра 7");
    expect(
      getNumerologyComparisonIndicatorLabel(
        { ...comparison, block: "psychomatrix", code: "digit_7" },
        "en"
      )
    ).toBe("Luck · digit 7");
  });

  it("humanizes unknown snake-case and camel-case codes without trusting raw explanations", () => {
    const snake = { ...comparison, block: "strength_lines" as const, code: "future_metric" };
    const camel = { ...comparison, code: "futureMetric" };

    expect(getNumerologyComparisonIndicatorLabel(snake, "ru")).toBe("Future Metric");
    expect(getNumerologyComparisonIndicatorLabel(camel, "en")).toBe("Future Metric");
    expect(formatNumerologyComparison(snake, "ru")).not.toContain(snake.explanation);
    expect(formatNumerologyComparison(camel, "en")).not.toContain(camel.explanation);
  });
});
