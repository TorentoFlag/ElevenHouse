import { PDFDocument } from "pdf-lib";
import { storedChartCalculationPayloadSchema } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import type { ChartPdfDocument } from "./calculation-pdf.documents";
import { buildChartPdfContent, createChartPdfRenderer } from "./chart-pdf.renderer";

describe("Chart PDF renderer", () => {
  it("composes natal chart metadata, points, houses, aspects and distributions", () => {
    const content = buildChartPdfContent(document());

    expect(keyValues(content, "Расчёт").map((item) => item.label)).toEqual([
      "Название",
      "Провайдер",
      "Система домов",
      "Узлы",
      "Орбы"
    ]);
    expect(keyValues(content, "Данные рождения")).toContainEqual({
      label: "Место",
      value: "41.9028, 12.4964"
    });
    expect(table(content, "Планеты и точки").rows).toHaveLength(14);
    expect(table(content, "Дома").rows).toHaveLength(12);
    expect(table(content, "Аспекты").rows).toHaveLength(1);
    expect(table(content, "Распределения").rows).toEqual([
      ["Огонь", "3"],
      ["Земля", "2"],
      ["Воздух", "3"],
      ["Вода", "2"],
      ["Кардинальный", "4"],
      ["Фиксированный", "3"],
      ["Мутабельный", "3"],
      ["Мужская", "6"],
      ["Женская", "4"]
    ]);
  });

  it("renders deterministic RU and EN PDFs", async () => {
    const renderer = createChartPdfRenderer();
    const first = await renderer.render(document());
    const second = await renderer.render(document());
    const english = await renderer.render(document("en"));
    const ruDocument = await PDFDocument.load(first.bytes);
    const enDocument = await PDFDocument.load(english.bytes);

    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(first.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(first.pageCount).toBeGreaterThanOrEqual(2);
    expect(ruDocument.getTitle()).toBe("Натальная карта");
    expect(enDocument.getTitle()).toBe("Natal chart");
    expect(first.bytes.toString("latin1")).not.toContain("/JavaScript");
    expect(first.bytes.toString("latin1")).not.toContain("/JS");
    expect(JSON.stringify(buildChartPdfContent(document("en")))).toContain("Planets and points");
  });
});

function document(locale: "ru" | "en" = "ru"): ChartPdfDocument {
  return {
    kind: "chart",
    locale,
    createdAt: "2026-07-22T12:00:00.000Z",
    calculationTitle: "Natal chart",
    result: storedChartCalculationPayloadSchema.parse(chartResult())
  };
}

function chartResult() {
  return {
    schemaVersion: "chart-result.v1",
    method: "natal",
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
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    result: {
      points: [
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
      ].map((id, index) => ({
        id,
        label: id,
        longitude: index * 20,
        sign: index % 2 === 0 ? "cancer" : "aries",
        signDegree: index % 29,
        house: index < 12 ? index + 1 : null,
        retrograde: id === "saturn"
      })),
      houses: Array.from({ length: 12 }, (_, index) => ({
        number: index + 1,
        longitude: index * 30,
        sign: "aries",
        signDegree: 0
      })),
      aspects: [
        {
          pointA: "sun",
          pointB: "moon",
          type: "square",
          angle: 90,
          orb: 1.2,
          applying: true,
          strength: 0.8
        }
      ],
      distributions: {
        elements: { fire: 3, earth: 2, air: 3, water: 2 },
        modalities: { cardinal: 4, fixed: 3, mutable: 3 },
        polarity: { masculine: 6, feminine: 4 }
      },
      warnings: []
    }
  };
}

function keyValues(content: ReturnType<typeof buildChartPdfContent>, heading: string) {
  const block = content.find((item) => item.kind === "key_values" && item.heading === heading);
  if (!block || block.kind !== "key_values") throw new Error(`Missing ${heading}`);
  return block.items;
}

function table(content: ReturnType<typeof buildChartPdfContent>, heading: string) {
  const block = content.find((item) => item.kind === "table" && item.heading === heading);
  if (!block || block.kind !== "table") throw new Error(`Missing ${heading}`);
  return block;
}
