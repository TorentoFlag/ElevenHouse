import type { CalculationPdfJob, CalculationRecord } from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { CalculationPdfPermanentError } from "./calculation-pdf.registry";
import { createChartPdfSource } from "./chart-pdf.source";

describe("Chart PDF source", () => {
  it("loads the current deterministic natal calculation result", async () => {
    const current = calculation();
    const source = createChartPdfSource({
      findByOwnerAndId: vi.fn(async () => current)
    } as never);

    await expect(source.load(pdfJob())).resolves.toMatchObject({
      kind: "chart",
      locale: "ru",
      createdAt: pdfJob().createdAt,
      calculationTitle: "Natal chart",
      result: {
        schemaVersion: "chart-result.v1",
        method: "natal",
        provider: { name: "kerykeion" }
      }
    });
  });

  it.each([
    { sourceLocator: { kind: "approved_interpretation" as const, interpretationId: null } },
    { module: "numerology" as const },
    { methodCode: "transits" },
    { resultChecksum: `sha256:${"e".repeat(64)}` }
  ])("rejects stale job identity %#", async (override) => {
    const source = createChartPdfSource({
      findByOwnerAndId: vi.fn(async () => calculation())
    } as never);

    await expect(source.load(pdfJob(override as never))).rejects.toBeInstanceOf(
      CalculationPdfPermanentError
    );
  });

  it("rejects archived, missing or invalid chart records", async () => {
    const archived = createChartPdfSource({
      findByOwnerAndId: vi.fn(async () => calculation({ status: "archived" }))
    } as never);
    await expect(archived.load(pdfJob())).rejects.toMatchObject({ code: "stale_source" });

    const missing = createChartPdfSource({
      findByOwnerAndId: vi.fn(async () => null)
    } as never);
    await expect(missing.load(pdfJob())).rejects.toMatchObject({ code: "stale_source" });

    const invalid = createChartPdfSource({
      findByOwnerAndId: vi.fn(async () => calculation({ resultData: { method: "natal" } }))
    } as never);
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
    sourceLocator: { kind: "calculation_result" },
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
    interpretations: [],
    artifacts: [],
    createdAt: pdfJob().createdAt,
    updatedAt: pdfJob().updatedAt,
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
