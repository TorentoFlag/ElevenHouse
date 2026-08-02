import type { CalculationPdfJob, CalculationRecord } from "@elevenhouse/domain";
import type { DictionaryStore } from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { CalculationPdfPermanentError } from "./calculation-pdf.registry";
import { createChartPdfSource } from "./chart-pdf.source";

describe("Chart PDF source", () => {
  it("loads the current deterministic natal calculation result with approved AI interpretation", async () => {
    const current = calculation();
    const source = createChartPdfSource({
      findByOwnerAndId: vi.fn(async () => current)
    } as never, dictionaryStore());

    await expect(source.load(pdfJob())).resolves.toMatchObject({
      kind: "chart",
      locale: "ru",
      createdAt: pdfJob().createdAt,
      calculationTitle: "Natal chart",
      approvedInterpretation: "Approved chart interpretation",
      result: {
        schemaVersion: "chart-result.v1",
        method: "natal",
        provider: { name: "kerykeion" }
      }
    });
  });

  it("allows deterministic natal PDF without an approved AI interpretation", async () => {
    const current = calculation({ interpretations: [] });
    const source = createChartPdfSource({
      findByOwnerAndId: vi.fn(async () => current)
    } as never, dictionaryStore());

    await expect(
      source.load(
        pdfJob({
          sourceLocator: { kind: "approved_interpretation", interpretationId: null }
        })
      )
    ).resolves.toMatchObject({
      approvedInterpretation: null
    });
  });

  it("loads only current-chart dictionary interpretations by deterministic codes", async () => {
    const dictionaryStore = {
      listEntriesByCodes: vi.fn(async () => ({
        entries: [
          {
            id: "00000000-0000-4000-8000-000000000010",
            categoryId: "00000000-0000-4000-8000-000000000011",
            categoryCode: "planets_in_signs",
            code: "sun_cancer",
            locale: "ru",
            source: "platform",
            title: "Солнце в Раке",
            content: "Трактовка из справочника.",
            createdAt: "2026-07-22T10:00:00.000Z",
            updatedAt: "2026-07-22T10:00:00.000Z"
          }
        ],
        total: 1,
        counts: { sources: { all: 1, platform: 1, modified: 0, custom: 0 } }
      }))
    } as Partial<DictionaryStore> as DictionaryStore;
    const source = createChartPdfSource(
      {
        findByOwnerAndId: vi.fn(async () => calculation())
      } as never,
      dictionaryStore
    );

    const document = await source.load(pdfJob());

    expect(dictionaryStore.listEntriesByCodes).toHaveBeenCalledWith({
      ownerUserId: pdfJob().ownerUserId,
      locale: "ru",
      codes: expect.arrayContaining(["sun_cancer", "moon_aries", "square", "sun_moon"])
    });
    expect(document).toMatchObject({
      interpretations: expect.arrayContaining([
        expect.objectContaining({
          code: "sun_cancer",
          label: "Солнце в Раке",
          entry: expect.objectContaining({
            title: "Солнце в Раке",
            content: "Трактовка из справочника.",
            source: "platform"
          })
        }),
        expect.objectContaining({
          code: "moon_aries",
          entry: null
        })
      ])
    });
  });

  it.each([
    { sourceLocator: { kind: "calculation_result" as const } },
    {
      sourceLocator: {
        kind: "approved_interpretation" as const,
        interpretationId: "00000000-0000-4000-8000-000000000099"
      }
    },
    { module: "numerology" as const },
    { methodCode: "transits" },
    { resultChecksum: `sha256:${"e".repeat(64)}` }
  ])("rejects stale job identity %#", async (override) => {
    const source = createChartPdfSource({
      findByOwnerAndId: vi.fn(async () => calculation())
    } as never, dictionaryStore());

    await expect(source.load(pdfJob(override as never))).rejects.toBeInstanceOf(
      CalculationPdfPermanentError
    );
  });

  it("rejects archived, missing or invalid chart records", async () => {
    const archived = createChartPdfSource({
      findByOwnerAndId: vi.fn(async () => calculation({ status: "archived" }))
    } as never, dictionaryStore());
    await expect(archived.load(pdfJob())).rejects.toMatchObject({ code: "stale_source" });

    const missing = createChartPdfSource({
      findByOwnerAndId: vi.fn(async () => null)
    } as never, dictionaryStore());
    await expect(missing.load(pdfJob())).rejects.toMatchObject({ code: "stale_source" });

    const invalid = createChartPdfSource({
      findByOwnerAndId: vi.fn(async () => calculation({ resultData: { method: "natal" } }))
    } as never, dictionaryStore());
    await expect(invalid.load(pdfJob())).rejects.toMatchObject({ code: "invalid_source" });
  });
});

function pdfJob(overrides: Partial<CalculationPdfJob> = {}): CalculationPdfJob {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    calculationId: "00000000-0000-4000-8000-000000000002",
    ownerUserId: "00000000-0000-4000-8000-000000000003",
    module: "chart",
    methodCode: "natal",
    resultChecksum: `sha256:${"a".repeat(64)}`,
    locale: "ru",
    sourceLocator: {
      kind: "approved_interpretation",
      interpretationId: "00000000-0000-4000-8000-000000000004"
    },
    documentFingerprint: `sha256:${"b".repeat(64)}`,
    status: "processing",
    artifactId: "00000000-0000-4000-8000-000000000005",
    mediaAssetId: "00000000-0000-4000-8000-000000000006",
    failureCode: null,
    failureReason: null,
    pageCount: null,
    createdAt: "2026-07-22T12:00:00.000Z",
    updatedAt: "2026-07-22T12:00:00.000Z",
    ...overrides
  };
}

function dictionaryStore(overrides: Partial<DictionaryStore> = {}): DictionaryStore {
  return {
    listCategories: vi.fn(async () => ({
      categories: [],
      total: 0
    })),
    listEntries: vi.fn(async () => emptyDictionaryEntries()),
    listEntriesByCodes: vi.fn(async () => emptyDictionaryEntries()),
    createCustomEntry: vi.fn(),
    updateCustomEntry: vi.fn(),
    upsertPlatformEntryOverride: vi.fn(),
    deleteAstrologerEntry: vi.fn(),
    resetAstrologerEntries: vi.fn(),
    resetPlatformEntryOverride: vi.fn(),
    ...overrides
  } as DictionaryStore;
}

function emptyDictionaryEntries() {
  return {
    entries: [],
    total: 0,
    counts: { sources: { all: 0, platform: 0, modified: 0, custom: 0 } }
  };
}

function calculation(overrides: Partial<CalculationRecord> = {}): CalculationRecord {
  return {
    id: pdfJob().calculationId,
    ownerUserId: pdfJob().ownerUserId,
    module: "chart",
    mode: "individual",
    methodCode: "natal",
    title: "Natal chart",
    status: "linked",
    participants: [],
    requestFingerprint: `sha256:${"c".repeat(64)}`,
    inputData: {},
    resultData: chartResult(),
    resultSummary: {},
    resultChecksum: pdfJob().resultChecksum,
    links: [],
    interpretations: [interpretation()],
    artifacts: [],
    createdAt: pdfJob().createdAt,
    updatedAt: pdfJob().updatedAt,
    ...overrides
  };
}

function interpretation(
  overrides: Partial<CalculationRecord["interpretations"][number]> = {}
): CalculationRecord["interpretations"][number] {
  return {
    id: "00000000-0000-4000-8000-000000000004",
    source: "ai",
    status: "approved",
    text: "Approved chart interpretation",
    modelId: "gpt-5.5",
    promptVersion: "chart.interpretationDraft@2",
    approvedAt: "2026-07-22T12:03:00.000Z",
    updatedAt: "2026-07-22T12:03:00.000Z",
    ...overrides
  };
}

export function chartResult() {
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
