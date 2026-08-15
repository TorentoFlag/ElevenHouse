import { describe, expect, it } from "vitest";
import type { ChartCalculationMethod, ReproducibleChartResult } from "@elevenhouse/contracts";
import { buildChartAiDraftContext } from "./chart-ai-context";

describe("chart AI context", () => {
  it.each([
    "natal",
    "astrocartography",
    "transit",
    "synastry",
    "composite",
    "solar_return",
    "progression",
    "horary"
  ] as const)("projects calculated %s factors without client identity", (method) => {
    const context = buildChartAiDraftContext({
      locale: "ru",
      result: result(method),
      subjectKind: "adult",
      dictionaryEntries: []
    });

    expect(context.methodCode).toBe(method);
    expect(context.factors).not.toHaveLength(0);
    expect(JSON.stringify(context)).not.toContain("clientId");
    expect(JSON.stringify(context)).not.toContain("displayName");
  });

  it("uses the same factor projection for child natal while keeping the child prompt selector", () => {
    const adult = buildChartAiDraftContext({
      locale: "ru",
      result: result("natal"),
      subjectKind: "adult",
      dictionaryEntries: []
    });
    const child = buildChartAiDraftContext({
      locale: "ru",
      result: result("natal"),
      subjectKind: "child",
      dictionaryEntries: []
    });

    expect(child.factors).toEqual(adult.factors);
    expect(child.subjectKind).toBe("child");
  });

  it("passes the horary question and category into the AI draft context", () => {
    const context = buildChartAiDraftContext({
      locale: "ru",
      result: result("horary"),
      subjectKind: "adult",
      dictionaryEntries: []
    });

    expect(context.horaryQuestion).toEqual({
      question: "Подпишет ли клиент договор в этом месяце?",
      category: "career"
    });
  });
});

function result(method: ChartCalculationMethod): ReproducibleChartResult {
  const rendered = {
    points: [
      {
        id: "sun",
        label: "Sun",
        longitude: 10,
        sign: "Aries",
        signDegree: 10,
        house: 1,
        retrograde: false
      }
    ],
    houses: [{ number: 1, longitude: 0, sign: "Aries", signDegree: 0 }],
    aspects: [],
    distributions: {
      elements: { fire: 1, earth: 0, air: 0, water: 0 },
      modalities: { cardinal: 1, fixed: 0, mutable: 0 },
      polarity: { masculine: 1, feminine: 0 }
    },
    warnings: []
  };
  const base = {
    schemaVersion: "chart-result.v2",
    method,
    settings: {
      zodiac: "tropical",
      houseSystem: "placidus",
      nodeType: "true",
      aspectPreset: "major",
      orbMultiplier: 1
    }
  };
  if (method === "astrocartography") {
    return { ...base, result: { lines: [], warnings: [] } } as unknown as ReproducibleChartResult;
  }
  if (method === "transit") {
    return {
      ...base,
      result: { natal: rendered, transit: rendered, aspectsToNatal: [], warnings: [] },
      transitSnapshot: { date: "2026-08-15", time: "12:00", timezone: "UTC" }
    } as unknown as ReproducibleChartResult;
  }
  if (method === "synastry") {
    return {
      ...base,
      result: {
        primary: rendered,
        partner: rendered,
        aspectsBetween: [],
        houseOverlays: [],
        warnings: []
      }
    } as unknown as ReproducibleChartResult;
  }
  if (method === "solar_return") {
    return {
      ...base,
      result: { natal: rendered, solarReturn: rendered, aspectsToNatal: [], warnings: [] },
      solarReturnSnapshot: { year: 2026 }
    } as unknown as ReproducibleChartResult;
  }
  if (method === "progression") {
    return {
      ...base,
      result: { natal: rendered, progressed: rendered, aspectsToNatal: [], warnings: [] },
      progressionSnapshot: { targetDate: "2026-08-15" },
      calculationBasis: { elapsedYears: 36 }
    } as unknown as ReproducibleChartResult;
  }
  if (method === "horary") {
    return {
      ...base,
      result: rendered,
      questionSnapshot: {
        question: "Подпишет ли клиент договор в этом месяце?",
        category: "career",
        date: "2026-08-15",
        time: "12:00",
        timezone: "UTC"
      }
    } as unknown as ReproducibleChartResult;
  }
  return { ...base, result: rendered } as unknown as ReproducibleChartResult;
}
