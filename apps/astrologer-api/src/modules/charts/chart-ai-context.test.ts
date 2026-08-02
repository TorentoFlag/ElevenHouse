import { describe, expect, it } from "vitest";
import type { DictionaryEffectiveEntry } from "@elevenhouse/domain";
import type { StoredChartNatalCalculationPayload } from "@elevenhouse/contracts";
import { buildNatalChartAiContext, getNatalChartAiDictionaryCodes } from "./chart-ai-context";

describe("chart AI context", () => {
  it("builds natal prompt context from deterministic chart result without birth fields", () => {
    const result = natalPayload();
    const codes = getNatalChartAiDictionaryCodes(result);
    const context = buildNatalChartAiContext({
      locale: "ru",
      result,
      resultChecksum: `sha256:${"b".repeat(64)}`,
      dictionaryEntries: codes.slice(0, 3).map((code) => dictionaryEntry(code))
    });

    expect(context.methodCode).toBe("natal");
    expect(context.points[0]).toMatchObject({ id: "sun", sign: "Cancer", house: 10 });
    expect(context.houses).toHaveLength(12);
    expect(context.majorAspects[0]).toMatchObject({ pointA: "sun", pointB: "moon" });
    expect(context.dictionaryGrounding.map((entry) => entry.code)).toEqual(codes.slice(0, 3));

    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("birthDate");
    expect(serialized).not.toContain("birthTime");
    expect(serialized).not.toContain("timezone");
    expect(serialized).not.toContain("latitude");
    expect(serialized).not.toContain("longitude");
  });

  it("orders strongest aspects first and trims dictionary grounding", () => {
    const result = natalPayload();
    const longEntry = dictionaryEntry("sun_cancer", "x".repeat(2_000));
    const context = buildNatalChartAiContext({
      locale: "ru",
      result,
      resultChecksum: `sha256:${"b".repeat(64)}`,
      dictionaryEntries: [longEntry]
    });

    expect(context.majorAspects.map((aspect) => aspect.type)).toEqual(["trine", "square"]);
    expect(context.dictionaryGrounding[0]?.content.length).toBeLessThanOrEqual(1_600);
  });
});

function dictionaryEntry(code: string, content = "Справочная трактовка."): DictionaryEffectiveEntry {
  return {
    id: `entry-${code}`,
    categoryId: "category-1",
    categoryCode: "planets_in_signs",
    code,
    locale: "ru",
    source: "platform",
    title: code,
    content,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z"
  };
}

function natalPayload(): StoredChartNatalCalculationPayload {
  const pointIds = [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "ascendant",
    "midheaven",
    "north_node",
    "south_node"
  ];
  return {
    schemaVersion: "chart-result.v1",
    method: "natal",
    provider: { name: "kerykeion", version: "5.12", ephemeris: "swiss-ephemeris" },
    settings: {
      zodiac: "tropical",
      houseSystem: "placidus",
      nodeType: "true",
      aspectPreset: "major",
      orbMultiplier: 1
    },
    inputSnapshot: {
      birthDate: "1991-07-10",
      birthTime: "13:10",
      timezone: "Europe/Saratov",
      latitude: 51.49,
      longitude: 44.48,
      birthTimePrecision: "exact"
    },
    result: {
      points: pointIds.map((id, index) => ({
        id,
        label: id,
        longitude: index * 20,
        sign: index % 2 === 0 ? "Cancer" : "Gemini",
        signDegree: index,
        house: ((index + 9) % 12) + 1,
        retrograde: false
      })),
      houses: Array.from({ length: 12 }, (_, index) => ({
        number: index + 1,
        longitude: index * 30,
        sign: index % 2 === 0 ? "Libra" : "Scorpio",
        signDegree: index
      })),
      aspects: [
        {
          pointA: "sun",
          pointB: "moon",
          type: "trine",
          angle: 120,
          orb: 1.2,
          applying: true,
          strength: 0.9
        },
        {
          pointA: "venus",
          pointB: "mars",
          type: "square",
          angle: 90,
          orb: 0.4,
          applying: false,
          strength: 0.7
        }
      ],
      distributions: {
        elements: { fire: 2, earth: 2, air: 4, water: 6 },
        modalities: { cardinal: 4, fixed: 5, mutable: 5 },
        polarity: { masculine: 6, feminine: 8 }
      },
      warnings: [{ code: "time_precision", message: "Exact time used" }]
    }
  };
}
