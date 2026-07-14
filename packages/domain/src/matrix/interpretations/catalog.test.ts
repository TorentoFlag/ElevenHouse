import { describe, expect, it } from "vitest";
import {
  MATRIX_INTERPRETATION_CONTEXTS,
  MATRIX_INTERPRETATION_LOCALES,
  resolveMatrixInterpretation
} from "./catalog";

describe("Matrix interpretation catalog", () => {
  it("resolves every RU/EN arcana and context combination", () => {
    for (const locale of MATRIX_INTERPRETATION_LOCALES) {
      for (let arcana = 1; arcana <= 22; arcana += 1) {
        for (const context of MATRIX_INTERPRETATION_CONTEXTS) {
          const entry = resolveMatrixInterpretation({ locale, arcana, context });
          expect(entry).toMatchObject({ catalogRevision: 1, locale, arcana, context });
          expect(entry.title.length).toBeGreaterThan(0);
          expect(entry.constructive.length).toBeGreaterThan(0);
          expect(entry.shadow.length).toBeGreaterThan(0);
          expect(entry.reflectionQuestions.length).toBeGreaterThan(0);
          expect(entry.practicalRecommendations.length).toBeGreaterThan(0);
          expect(entry.reportSummary.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("uses independently authored locale content", () => {
    const ru = resolveMatrixInterpretation({ locale: "ru", arcana: 9, context: "portrait" });
    const en = resolveMatrixInterpretation({ locale: "en", arcana: 9, context: "portrait" });
    expect(ru.title).toContain("Отшельник");
    expect(en.title).toContain("Hermit");
    expect(en.constructive).not.toBe(ru.constructive);
  });

  it("is deterministic and context-specific", () => {
    const first = resolveMatrixInterpretation({ locale: "ru", arcana: 9, context: "money" });
    const replay = resolveMatrixInterpretation({ locale: "ru", arcana: 9, context: "money" });
    const portrait = resolveMatrixInterpretation({
      locale: "ru",
      arcana: 9,
      context: "portrait"
    });
    expect(replay).toEqual(first);
    expect(first.constructive).not.toBe(portrait.constructive);
    expect(first.reflectionQuestions).not.toEqual(portrait.reflectionQuestions);
  });

  it.each([
    { locale: "de", arcana: 9, context: "portrait" },
    { locale: "ru", arcana: 0, context: "portrait" },
    { locale: "ru", arcana: 23, context: "portrait" },
    { locale: "ru", arcana: 9, context: "medical" }
  ])("rejects unsupported coordinates %#", (input) => {
    expect(() => resolveMatrixInterpretation(input)).toThrow("Unsupported Matrix interpretation");
  });
});
