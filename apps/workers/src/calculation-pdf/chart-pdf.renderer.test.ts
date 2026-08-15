import { PDFDocument } from "pdf-lib";
import {
  chartAstrocartographyResultV2Schema,
  chartMethodVersions,
  chartNatalResultV2Schema,
  chartProgressionResultV2Schema,
  chartSolarReturnResultV2Schema,
  chartSynastryResultV2Schema,
  chartTransitResultV2Schema,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import { buildChartResultReproducibilityFingerprint } from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";
import type { ChartPdfDocument } from "./calculation-pdf.documents";
import { buildChartPdfInterpretations } from "./chart-pdf.interpretations";
import { buildChartPdfContent, createChartPdfRenderer } from "./chart-pdf.renderer";

describe("Chart PDF renderer", () => {
  it("composes client-facing natal chart settings, points, houses, aspects and distributions", () => {
    const content = buildChartPdfContent(document());

    expect(content[0]).toMatchObject({
      kind: "wheel",
      heading: "Колесо карты"
    });
    expect(keyValues(content, "Расчёт").map((item) => item.label)).toEqual([
      "Название",
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

  it("keeps chart-engine implementation metadata out of client-facing PDFs", () => {
    const russianContent = JSON.stringify(buildChartPdfContent(document("ru")));
    const englishContent = JSON.stringify(buildChartPdfContent(document("en")));

    for (const content of [russianContent, englishContent]) {
      expect(content).not.toContain("kerykeion");
      expect(content).not.toContain("5.12.9");
      expect(content).not.toContain("moshier");
      expect(content).not.toContain("swiss-ephemeris");
      expect(content).not.toContain("Провайдер");
      expect(content).not.toContain("Provider");
    }
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

  it("renders valid non-natal PDFs for chart methods with different result shapes", async () => {
    const renderer = createChartPdfRenderer();
    const transit = await renderer.render(
      document("ru", {
        calculationTitle: "Транзит",
        result: transitResult()
      })
    );
    const astrocartography = await renderer.render(
      document("ru", {
        calculationTitle: "Астрокарта",
        result: astrocartographyResult()
      })
    );
    const transitDocument = await PDFDocument.load(transit.bytes);
    const astrocartographyDocument = await PDFDocument.load(astrocartography.bytes);

    expect(transit.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(astrocartography.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(transitDocument.getPageCount()).toBeGreaterThan(0);
    expect(astrocartographyDocument.getPageCount()).toBeGreaterThan(0);
    expect(transitDocument.getTitle()).toBe("Транзит");
    expect(astrocartographyDocument.getTitle()).toBe("Астрокарта");
    expect(transit.bytes.toString("latin1")).not.toContain("/JavaScript");
    expect(astrocartography.bytes.toString("latin1")).not.toContain("/JavaScript");
  });

  it("composes a transit PDF as one combined overlay wheel before natal and transit tables", () => {
    const content = buildChartPdfContent(
      document("ru", {
        calculationTitle: "Транзит",
        result: transitResult()
      })
    );

    expect(keyValues(content, "Расчёт")).toContainEqual({
      label: "Тип карты",
      value: "Транзиты"
    });
    expect(content.find((block) => block.kind === "overlay_wheel")).toMatchObject({
      kind: "overlay_wheel",
      heading: "Транзиты · Колесо карты"
    });
    expect(content.filter((block) => block.kind === "wheel").map((block) => block.heading)).toEqual(
      []
    );
    expect(table(content, "Натальная карта · Планеты и точки").rows).toHaveLength(14);
    expect(table(content, "Транзитная карта · Планеты и точки").rows).toHaveLength(14);
    expect(table(content, "Аспекты к натальной карте").rows[0]).toEqual([
      "Юпитер",
      "Трин",
      "Солнце",
      "1°24'",
      "70%"
    ]);
  });

  it.each([
    {
      title: "Соляр",
      heading: "Соляр · Колесо карты",
      primaryTable: "Натальная карта · Планеты и точки",
      overlayTable: "Карта соляра · Планеты и точки",
      result: solarReturnResult()
    },
    {
      title: "Прогрессии",
      heading: "Прогрессии · Колесо карты",
      primaryTable: "Натальная карта · Планеты и точки",
      overlayTable: "Прогрессивная карта · Планеты и точки",
      result: progressionResult()
    }
  ])(
    "composes $title PDF as one combined overlay wheel before both data tables",
    ({ heading, overlayTable, primaryTable, result, title }) => {
      const content = buildChartPdfContent(
        document("ru", {
          calculationTitle: title,
          result
        })
      );

      expect(content.find((block) => block.kind === "overlay_wheel")).toMatchObject({
        kind: "overlay_wheel",
        heading
      });
      expect(
        content.filter((block) => block.kind === "wheel").map((block) => block.heading)
      ).toEqual([]);
      expect(table(content, primaryTable).rows).toHaveLength(14);
      expect(table(content, overlayTable).rows).toHaveLength(14);
      expect(table(content, "Аспекты к натальной карте").rows).toHaveLength(1);
    }
  );

  it("composes an astrocartography PDF without assuming wheel-shaped result data", () => {
    const content = buildChartPdfContent(
      document("ru", {
        calculationTitle: "Астрокарта",
        result: astrocartographyResult()
      })
    );

    expect(keyValues(content, "Расчёт")).toContainEqual({
      label: "Тип карты",
      value: "Астрокарта"
    });
    expect(content[0]).toMatchObject({
      kind: "astrocartography_map",
      heading: "Астрокарта · Карта линий"
    });
    expect(table(content, "Линии астрокарты").rows).toHaveLength(40);
  });

  it("composes synastry PDF as one combined dual-wheel before client and partner tables", async () => {
    const renderer = createChartPdfRenderer();
    const content = buildChartPdfContent(
      document("ru", {
        calculationTitle: "Синастрия",
        result: synastryResult()
      })
    );
    const pdf = await renderer.render(
      document("ru", {
        calculationTitle: "Синастрия",
        result: synastryResult()
      })
    );
    const parsed = await PDFDocument.load(pdf.bytes);

    expect(content[0]).toMatchObject({
      kind: "synastry_wheel",
      heading: "Синастрия · Колесо карты"
    });
    expect(content.filter((block) => block.kind === "wheel").map((block) => block.heading)).toEqual(
      []
    );
    expect(table(content, "Карта клиента · Планеты и точки").rows).toHaveLength(14);
    expect(table(content, "Карта партнёра · Планеты и точки").rows).toHaveLength(14);
    expect(table(content, "Аспекты между картами").rows[0]).toEqual([
      "Солнце",
      "Оппозиция",
      "Марс",
      "1°12'",
      "64%"
    ]);
    expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(parsed.getTitle()).toBe("Синастрия");
  });
});

type NatalChartResultV2 = Extract<ReproducibleChartResult, { readonly method: "natal" }>;

function document(
  locale: "ru" | "en" = "ru",
  overrides: Partial<ChartPdfDocument> = {}
): ChartPdfDocument {
  return {
    kind: "chart",
    locale,
    createdAt: "2026-07-22T12:00:00.000Z",
    calculationTitle: "Natal chart",
    result: chartResult(),
    approvedInterpretation: null,
    interpretations: [],
    ...overrides
  };
}

function rolloverDocument(locale: "ru" | "en" = "ru"): ChartPdfDocument {
  const currentResult = chartResult();
  const current = document(locale, { result: currentResult });
  const firstPoint = currentResult.result.points[0]!;
  const firstHouse = currentResult.result.houses[0]!;
  const firstAspect = currentResult.result.aspects[0]!;

  return {
    ...current,
    result: {
      ...currentResult,
      result: {
        ...currentResult.result,
        points: [
          { ...firstPoint, longitude: 359.999, sign: "pisces", signDegree: 29.999 },
          ...currentResult.result.points.slice(1)
        ],
        houses: [
          { ...firstHouse, longitude: 359.999, sign: "pisces", signDegree: 29.999 },
          ...currentResult.result.houses.slice(1)
        ],
        aspects: [{ ...firstAspect, orb: 1.999 }, ...currentResult.result.aspects.slice(1)]
      }
    }
  };
}

function chartResult(): NatalChartResultV2 {
  const candidate = chartNatalResultV2Schema.parse({
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
  });
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function transitResult() {
  const natal = chartResult();
  const candidate = chartTransitResultV2Schema.parse({
    schemaVersion: "chart-result.v2",
    method: "transit",
    methodVersion: chartMethodVersions.transit,
    provider: natal.provider,
    reproducibilityFingerprint: `sha256:${"0".repeat(64)}`,
    settings: natal.settings,
    inputSnapshot: natal.inputSnapshot,
    transitSnapshot: {
      date: "2026-07-23",
      time: "14:30",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173
    },
    result: {
      natal: natal.result,
      transit: natal.result,
      aspectsToNatal: [
        {
          transitPoint: "jupiter",
          natalPoint: "sun",
          type: "trine",
          angle: 120,
          orb: 1.4,
          applying: true,
          strength: 0.7
        }
      ],
      warnings: []
    }
  });
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function solarReturnResult() {
  const natal = chartResult();
  const candidate = chartSolarReturnResultV2Schema.parse({
    schemaVersion: "chart-result.v2",
    method: "solar_return",
    methodVersion: chartMethodVersions.solar_return,
    provider: natal.provider,
    reproducibilityFingerprint: `sha256:${"0".repeat(64)}`,
    settings: natal.settings,
    inputSnapshot: natal.inputSnapshot,
    solarReturnSnapshot: {
      year: 2026,
      returnType: "solar",
      location: {
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964
      },
      resolvedAt: "2026-07-15T08:42:11Z"
    },
    result: {
      natal: natal.result,
      solarReturn: natal.result,
      aspectsToNatal: [
        {
          solarReturnPoint: "sun",
          natalPoint: "sun",
          type: "conjunction",
          angle: 0,
          orb: 0.01,
          applying: null,
          strength: 1
        }
      ],
      warnings: []
    }
  });
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function progressionResult() {
  const natal = chartResult();
  const candidate = chartProgressionResultV2Schema.parse({
    schemaVersion: "chart-result.v2",
    method: "progression",
    methodVersion: chartMethodVersions.progression,
    provider: natal.provider,
    reproducibilityFingerprint: `sha256:${"0".repeat(64)}`,
    settings: natal.settings,
    inputSnapshot: natal.inputSnapshot,
    progressionSnapshot: {
      targetDate: "2026-07-23",
      progressionType: "secondary",
      calculationBasis: {
        symbolicDate: "1990-08-20",
        ageDays: 36,
        dayForYearRatio: 1
      }
    },
    calculationBasis: {
      symbolicInstant: "1990-08-20T09:02:38Z",
      elapsedLifeDays: 13157,
      elapsedYears: 36.02267306523378,
      yearLengthDays: 365.24219,
      dayForYearRatio: 1
    },
    result: {
      natal: natal.result,
      progressed: natal.result,
      aspectsToNatal: [
        {
          progressedPoint: "moon",
          natalPoint: "sun",
          type: "trine",
          angle: 120,
          orb: 1.2,
          applying: true,
          strength: 0.76
        }
      ],
      warnings: []
    }
  });
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function synastryResult() {
  const primary = chartResult();
  const partnerBase = chartResult();
  const partner = {
    ...partnerBase.result,
    points: partnerBase.result.points.map((point, index) => ({
      ...point,
      longitude: normalizeTestLongitude(point.longitude + 46 + index)
    }))
  };
  const candidate = chartSynastryResultV2Schema.parse({
    schemaVersion: "chart-result.v2",
    method: "synastry",
    methodVersion: chartMethodVersions.synastry,
    provider: primary.provider,
    reproducibilityFingerprint: `sha256:${"0".repeat(64)}`,
    settings: primary.settings,
    inputSnapshot: primary.inputSnapshot,
    partnerInputSnapshot: {
      birthDate: "1992-08-11",
      birthTime: "08:15",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173,
      birthTimePrecision: "exact"
    },
    result: {
      primary: primary.result,
      partner,
      aspectsBetween: [
        {
          primaryPoint: "sun",
          partnerPoint: "mars",
          type: "opposition",
          angle: 180,
          orb: 1.2,
          applying: true,
          strength: 0.64
        }
      ],
      houseOverlays: [
        {
          owner: "primary",
          point: "venus",
          projectedHouseOwner: "partner",
          projectedHouse: 7
        }
      ],
      warnings: []
    }
  });
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function normalizeTestLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

function astrocartographyResult() {
  const natal = chartResult();
  const candidate = chartAstrocartographyResultV2Schema.parse({
    schemaVersion: "chart-result.v2",
    method: "astrocartography",
    methodVersion: chartMethodVersions.astrocartography,
    provider: {
      ...natal.provider,
      ephemeris: "swiss-ephemeris",
      ephemerisFlags: ["FLG_SWIEPH", "FLG_SPEED"],
      ephemerisDataRevision: `sha256:${"1".repeat(64)}`
    },
    reproducibilityFingerprint: `sha256:${"0".repeat(64)}`,
    settings: natal.settings,
    inputSnapshot: natal.inputSnapshot,
    result: {
      lines: astrocartographyLines(),
      warnings: []
    }
  });
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function astrocartographyLines() {
  const points = [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto"
  ] as const;
  const angles = ["asc", "dsc", "mc", "ic"] as const;
  return points.flatMap((point, pointIndex) =>
    angles.map((angle, angleIndex) => ({
      id: `${point}_${angle}`,
      point,
      angle,
      label: `${point} ${angle}`,
      path: [
        { latitude: -60 + pointIndex, longitude: -120 + angleIndex },
        { latitude: 60 - pointIndex, longitude: 120 - angleIndex }
      ]
    }))
  );
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
