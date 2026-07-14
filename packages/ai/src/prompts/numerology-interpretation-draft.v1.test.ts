import { describe, expect, it } from "vitest";
import {
  numerologyInterpretationDraftPromptV1,
  renderNumerologyInterpretationText
} from "./numerology-interpretation-draft.v1";

const strengthLines = [
  "goal",
  "family",
  "stability",
  "self_esteem",
  "material",
  "talent",
  "spirituality",
  "temperament"
].map((code, index) => ({
  code,
  label: code,
  value: index,
  level: "moderate" as const,
  levelLabel: "Умеренно"
}));

const individualInput = {
  locale: "ru" as const,
  methodCode: "pythagorean" as const,
  mode: "individual" as const,
  keyNumbers: { lifePath: 2, birthday: 1, expression: 6, soul: 6, personality: 9 },
  periods: {
    personalYear: { year: 2026, value: 1 },
    personalMonths: [],
    personalDay: null
  },
  psychomatrix: {
    workingNumbers: { first: 20, second: 2, third: 18, fourth: 9 },
    cellCounts: { "1": 2, "2": 3, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 2, "9": 2 }
  },
  strengthLines
};

const output = {
  overview: "Общий обзор.",
  strengths: "Сильные стороны.",
  growthAreas: "Зоны роста.",
  sessionFocus: "Фокус консультации.",
  periodFocus: "Фокус периода.",
  reflectionQuestions: ["Что сейчас важно?", "На что можно опереться?", "Что изменить?"],
  disclaimer: "Материал предназначен для рефлексии."
};

describe("numerology interpretation draft prompt", () => {
  it("accepts anonymous deterministic input and strict structured output", () => {
    expect(numerologyInterpretationDraftPromptV1.inputSchema.parse(individualInput)).toEqual(
      individualInput
    );
    expect(numerologyInterpretationDraftPromptV1.outputSchema.parse(output)).toEqual(output);
    expect(numerologyInterpretationDraftPromptV1.structuredOutputJsonSchema).toMatchObject({
      additionalProperties: false,
      required: [
        "overview",
        "strengths",
        "growthAreas",
        "sessionFocus",
        "periodFocus",
        "reflectionQuestions",
        "disclaimer"
      ]
    });
  });

  it("renders safe RU and EN instructions and localized editable text", () => {
    const ru = numerologyInterpretationDraftPromptV1.render(individualInput);
    const en = numerologyInterpretationDraftPromptV1.render({ ...individualInput, locale: "en" });
    expect(ru.messages[0]?.content).toContain("не пересчитывай");
    expect(en.messages[0]?.content).toContain("do not recalculate");
    expect(ru.messages[1]?.content).not.toContain("Голубев");

    expect(renderNumerologyInterpretationText(output, "ru")).toContain("ОБЗОР\nОбщий обзор.");
    expect(renderNumerologyInterpretationText(output, "en")).toContain(
      "OVERVIEW\nОбщий обзор."
    );
  });
});
