import { describe, expect, it } from "vitest";
import type { StoredChartAstrocartographyCalculationPayload } from "@elevenhouse/contracts";
import {
  formatAspectTypeDisplay,
  formatChartPointPosition,
  formatHouseSignDisplay,
  getAspectDisplaySymbol,
  getChartPointDisplayLabel,
  getChartPointSymbol,
  getPrimaryChartRenderResult,
  getZodiacDisplaySymbol
} from "./chartDisplay";

describe("chartDisplay", () => {
  it("maps provider point ids to Russian UI labels without changing canonical ids", () => {
    expect(getChartPointDisplayLabel("sun", "Sun")).toBe("Солнце");
    expect(getChartPointDisplayLabel("moon", "Moon")).toBe("Луна");
    expect(getChartPointDisplayLabel("ascendant", "Ascendant")).toBe("Асцендент");
    expect(getChartPointDisplayLabel("midheaven", "Midheaven")).toBe("Середина неба");
    expect(getChartPointDisplayLabel("north_node", "True North Node")).toBe("Северный узел");
    expect(getChartPointDisplayLabel("unknown", "Provider Name")).toBe("Provider Name");
  });

  it("formats signs, aspects and symbols in the Russian chart UI", () => {
    expect(formatChartPointPosition({ sign: "cancer", signDegree: 22.6, retrograde: false })).toBe(
      "Рак 22°36'"
    );
    expect(
      formatChartPointPosition({ sign: "capricorn", signDegree: 21.98, retrograde: true })
    ).toBe("Козерог 21°59' R");
    expect(formatHouseSignDisplay("virgo")).toBe("Дева");
    expect(formatAspectTypeDisplay("square")).toBe("Квадрат");
    expect(formatAspectTypeDisplay("semi-sextile")).toBe("Полусекстиль");
    expect(formatAspectTypeDisplay("semi-square")).toBe("Полуквадрат");
    expect(formatAspectTypeDisplay("quincunx")).toBe("Квинконс");
    expect(getChartPointSymbol("south_node", "True South Node")).toBe("☋︎");
  });

  it("normalizes rounded sign-boundary minutes instead of rendering 60 minutes", () => {
    expect(formatChartPointPosition({ sign: "capricorn", signDegree: 29.999 })).toBe(
      "Водолей 0°00'"
    );
    expect(formatChartPointPosition({ sign: "pisces", signDegree: 29.999 })).toBe("Овен 0°00'");
  });

  it("preserves unknown provider aspect and sign labels instead of inventing semantics", () => {
    expect(getAspectDisplaySymbol("biquintile", "en")).toBe("biquintile");
    expect(getZodiacDisplaySymbol("ophiuchus")).toBe("ophiuchus");
    expect(getZodiacDisplaySymbol("aries")).toBe("♈︎");
  });

  it("rejects astrocartography payloads in wheel-only helpers", () => {
    const result = {
      schemaVersion: "chart-result.v1",
      method: "astrocartography",
      provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
      settings: {
        zodiac: "tropical",
        houseSystem: "placidus",
        nodeType: "true",
        aspectPreset: "major",
        orbMultiplier: 1
      },
      inputSnapshot: {
        birthDate: "1990-07-15",
        birthTime: "10:30",
        timezone: "Europe/Moscow",
        latitude: 55.7558,
        longitude: 37.6173,
        birthTimePrecision: "exact"
      },
      result: {
        lines: [
          {
            id: "sun_mc",
            point: "sun",
            angle: "mc",
            label: "Солнце MC",
            path: [
              { latitude: -66, longitude: 10 },
              { latitude: 0, longitude: 10 },
              { latitude: 66, longitude: 10 }
            ]
          }
        ],
        warnings: []
      }
    } satisfies StoredChartAstrocartographyCalculationPayload;

    expect(() => getPrimaryChartRenderResult(result)).toThrow(
      "Astrocartography result does not contain a wheel render result"
    );
  });
});
