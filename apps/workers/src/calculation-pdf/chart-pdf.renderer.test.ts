import { PDFDocument } from "pdf-lib";
import {
  chartMethodVersions,
  chartNatalResultV2Schema,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import { buildChartResultReproducibilityFingerprint } from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";
import type { ChartPdfDocument } from "./calculation-pdf.documents";
import { buildChartPdfInterpretations } from "./chart-pdf.interpretations";
import { buildChartPdfContent, createChartPdfRenderer } from "./chart-pdf.renderer";

describe("Chart PDF renderer", () => {
  it("composes natal chart metadata, points, houses, aspects and distributions", () => {
    const content = buildChartPdfContent(document());

    expect(content[0]).toMatchObject({
      kind: "wheel",
      heading: "Колесо карты"
    });
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

  it("renders dictionary interpretations and honest missing-entry actions", () => {
    const content = buildChartPdfContent(
      document("ru", {
        interpretations: [
          {
            code: "sun_cancer",
            group: "points",
            label: "Солнце в Раке",
            meta: "Планета в знаке",
            position: "Рак 22°36' · XI дом",
            entry: {
              title: "Солнце в Раке",
              content: "Трактовка из справочника.",
              source: "platform"
            }
          },
          {
            code: "moon_house_8",
            group: "points",
            label: "Луна · VIII дом",
            meta: "Планета в доме",
            position: "Овен 21°13' · VIII дом",
            entry: null
          }
        ]
      })
    );

    const interpretations = table(content, "Трактовки из справочника");

    expect(interpretations.rows).toEqual([
      [
        "Солнце в Раке",
        "Планета в знаке · Рак 22°36' · XI дом",
        "Трактовка из справочника.",
        "Справочник · platform"
      ],
      [
        "Луна · VIII дом",
        "Планета в доме · Овен 21°13' · VIII дом",
        "Трактовка отсутствует. Создайте её в справочнике: moon_house_8",
        "Нет записи"
      ]
    ]);
  });

  it("renders the approved AI interpretation as a separate PDF section", () => {
    const content = buildChartPdfContent(
      document("ru", {
        approvedInterpretation: "Главный акцент карты: сильная связка Луны и Асцендента."
      })
    );

    expect(section(content, "AI-трактовка")).toMatchObject({
      text: "Главный акцент карты: сильная связка Луны и Асцендента."
    });
  });

  it("carries rounded zodiac positions into the next sign without minute 60", () => {
    const content = buildChartPdfContent(rolloverDocument("en"));

    expect(table(content, "Planets and points").rows[0]).toEqual([
      "Sun",
      "Aries",
      "0°00'",
      "House 1",
      "D"
    ]);
    expect(table(content, "Houses").rows[0]).toEqual(["House 1", "Aries", "0°00'"]);
    expect(table(content, "Aspects").rows[0]?.[3]).toBe("2°00'");
    expect(JSON.stringify(content)).not.toContain("°60'");
  });

  it("carries Pisces positions into Aries in dictionary interpretation coordinates", () => {
    const interpretations = buildChartPdfInterpretations({
      result: rolloverDocument().result,
      entries: []
    });

    expect(interpretations.find((item) => item.code === "sun_aries")?.position).toBe(
      "Овен 0°00' · I дом"
    );
    expect(interpretations.map((item) => item.code)).not.toContain("sun_pisces");
    expect(interpretations.find((item) => item.code === "house_1")?.position).toBe("Овен 0°00'");
    expect(interpretations.map((item) => item.position).join(" ")).not.toContain("°60'");
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

function document(
  locale: "ru" | "en" = "ru",
  overrides: Partial<ChartPdfDocument> = {}
): ChartPdfDocument {
  return {
    kind: "chart",
    locale,
    createdAt: "2026-07-22T12:00:00.000Z",
    calculationTitle: "Natal chart",
    result: chartNatalResultV2Schema.parse(chartResult()),
    approvedInterpretation: null,
    interpretations: [],
    ...overrides
  };
}

function rolloverDocument(locale: "ru" | "en" = "ru"): ChartPdfDocument {
  const current = document(locale);
  const firstPoint = current.result.result.points[0]!;
  const firstHouse = current.result.result.houses[0]!;
  const firstAspect = current.result.result.aspects[0]!;

  return {
    ...current,
    result: {
      ...current.result,
      result: {
        ...current.result.result,
        points: [
          { ...firstPoint, longitude: 359.999, sign: "pisces", signDegree: 29.999 },
          ...current.result.result.points.slice(1)
        ],
        houses: [
          { ...firstHouse, longitude: 359.999, sign: "pisces", signDegree: 29.999 },
          ...current.result.result.houses.slice(1)
        ],
        aspects: [{ ...firstAspect, orb: 1.999 }, ...current.result.result.aspects.slice(1)]
      }
    }
  };
}

function chartResult() {
  const candidate = {
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
    reproducibilityFingerprint: `sha256:${"0".repeat(64)}`,
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
  } as ReproducibleChartResult;
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
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

function section(content: ReturnType<typeof buildChartPdfContent>, heading: string) {
  const block = content.find((item) => item.kind === "section" && item.heading === heading);
  if (!block || block.kind !== "section") throw new Error(`Missing ${heading}`);
  return block;
}
