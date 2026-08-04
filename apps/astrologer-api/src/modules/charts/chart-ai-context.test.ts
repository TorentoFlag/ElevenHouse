import { describe, expect, it } from "vitest";
import type { DictionaryEffectiveEntry } from "@elevenhouse/domain";
import {
  chartMethodVersions,
  chartNatalResultV2Schema,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import { buildNatalChartAiContext, getNatalChartAiDictionaryCodes } from "./chart-ai-context";

describe("chart AI context", () => {
  it("builds natal prompt context from deterministic chart result without birth fields", () => {
    const result = natalPayload();
    const codes = getNatalChartAiDictionaryCodes(result);
    const context = buildNatalChartAiContext({
      locale: "ru",
      result,
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
    expect(context).not.toHaveProperty("resultChecksum");
    expect(serialized).not.toContain("reproducibilityFingerprint");
    expect(serialized).not.toContain("pyswissephVersion");
    expect(serialized).not.toContain("ephemerisFlags");
  });

  it("orders strongest aspects first and trims dictionary grounding", () => {
    const result = natalPayload();
    const longEntry = dictionaryEntry("sun_cancer", "x".repeat(2_000));
    const context = buildNatalChartAiContext({
      locale: "ru",
      result,
      dictionaryEntries: [longEntry]
    });

    expect(context.majorAspects.map((aspect) => aspect.type)).toEqual(["trine", "square"]);
    expect(context.dictionaryGrounding[0]?.content.length).toBeLessThanOrEqual(1_600);
  });

  it("excludes custom and modified astrologer text from the external prompt", () => {
    const result = natalPayload();
    const codes = getNatalChartAiDictionaryCodes(result);
    const context = buildNatalChartAiContext({
      locale: "ru",
      result,
      dictionaryEntries: [
        dictionaryEntry(codes[0]!, "CLIENT_NAME_PRIVATE_CRM_NOTE", "custom"),
        dictionaryEntry(codes[1]!, "CLIENT_PHONE_PRIVATE_CRM_NOTE", "modified"),
        dictionaryEntry(codes[2]!, "Проверенная платформенная трактовка.", "platform")
      ]
    });

    expect(context.dictionaryGrounding.map((entry) => entry.code)).toEqual([codes[2]]);
    expect(JSON.stringify(context)).not.toContain("PRIVATE_CRM_NOTE");
  });

  it("rejects a stored result without an explicit zodiac setting instead of defaulting it", () => {
    const result = natalPayload();
    const invalidResult = {
      ...result,
      settings: {
        ...result.settings,
        zodiac: undefined
      }
    } as unknown as Extract<ReproducibleChartResult, { method: "natal" }>;

    expect(() =>
      buildNatalChartAiContext({
        locale: "en",
        result: invalidResult,
        dictionaryEntries: []
      })
    ).toThrowError("Stored natal result must declare the tropical zodiac setting");
  });
});

function dictionaryEntry(
  code: string,
  content = "Справочная трактовка.",
  source: DictionaryEffectiveEntry["source"] = "platform"
): DictionaryEffectiveEntry {
  return {
    id: `entry-${code}`,
    categoryId: "category-1",
    categoryCode: "planets_in_signs",
    code,
    locale: "ru",
    source,
    title: code,
    content,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z"
  };
}

function natalPayload(): Extract<ReproducibleChartResult, { method: "natal" }> {
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
  return chartNatalResultV2Schema.parse({
    schemaVersion: "chart-result.v2",
    method: "natal",
    methodVersion: chartMethodVersions.natal,
    provider: {
      name: "kerykeion",
      version: "5.12.9",
      pyswissephVersion: "2.10.3.2",
      ephemeris: "moshier",
      ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
      ephemerisDataRevision: null
    },
    reproducibilityFingerprint: `sha256:${"a".repeat(64)}`,
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
        elements: { fire: 2, earth: 2, air: 3, water: 3 },
        modalities: { cardinal: 3, fixed: 3, mutable: 4 },
        polarity: { masculine: 5, feminine: 5 }
      },
      warnings: [{ code: "time_precision", message: "Exact time used" }]
    }
  });
}
