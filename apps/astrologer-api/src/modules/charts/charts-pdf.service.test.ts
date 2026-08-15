import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  chartMethodVersions,
  chartNatalResultV2Schema,
  type ChartExecutionProfile
} from "@elevenhouse/contracts";
import {
  buildChartResultReproducibilityFingerprint,
  sha256CanonicalJson,
  type CanonicalJson,
  type CalculationRecord
} from "@elevenhouse/domain";
import { CalculationPdfNotReadyError } from "../calculations/pdf/calculation-pdf.errors";
import { ChartsPdfService } from "./charts-pdf.service";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const calculationId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const checksum = `sha256:${"a".repeat(64)}`;
const executionProfile: ChartExecutionProfile = {
  provider: "kerykeion" as const,
  kerykeionVersion: "5.12.9" as const,
  pyswissephVersion: "2.10.3.2" as const,
  expectedEphemeris: "moshier" as const,
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"] as const,
  expectedEphemerisDataRevision: null
};

describe("ChartsPdfService", () => {
  it("requests a current natal chart PDF with the newest approved AI interpretation", async () => {
    const harness = createHarness({
      calculation: calculation({
        interpretations: [
          interpretation({
            id: "00000000-0000-4000-8000-000000000006",
            status: "draft",
            approvedAt: null
          }),
          interpretation({
            id: "00000000-0000-4000-8000-000000000007",
            status: "approved",
            approvedAt: "2026-07-22T12:03:00.000Z"
          })
        ]
      })
    });

    await expect(
      harness.service.enqueue(
        calculationId,
        { expectedResultChecksum: checksum, locale: "ru" },
        request()
      )
    ).resolves.toMatchObject({ job: { id: jobId } });

    expect(harness.calculationPdf.request).toHaveBeenCalledWith({
      ownerUserId,
      calculationId,
      expectedResultChecksum: checksum,
      locale: "ru",
      sourceLocator: {
        kind: "approved_interpretation",
        interpretationId: "00000000-0000-4000-8000-000000000007"
      },
      renderContract: "chart-natal-v3",
      originalFileName: "Натальная карта.pdf"
    });
  });

  it("allows deterministic chart export when only drafts exist", async () => {
    const harness = createHarness({
      calculation: calculation({
        interpretations: [
          interpretation({
            id: "00000000-0000-4000-8000-000000000006",
            status: "draft",
            approvedAt: null
          })
        ]
      })
    });

    await harness.service.enqueue(
      calculationId,
      { expectedResultChecksum: checksum, locale: "en" },
      request()
    );

    expect(harness.calculationPdf.request).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        sourceLocator: { kind: "approved_interpretation", interpretationId: null },
        originalFileName: "Natal chart.pdf"
      })
    );
  });

  it("restores latest locale-specific PDF state only for an owned natal chart", async () => {
    const harness = createHarness({
      calculation: calculation({
        interpretations: [
          interpretation({
            id: "00000000-0000-4000-8000-000000000007",
            status: "approved",
            approvedAt: "2026-07-22T12:03:00.000Z"
          })
        ]
      })
    });

    await harness.service.latest(calculationId, { locale: "en" }, request());

    expect(harness.calculationPdf.latest).toHaveBeenCalledWith({
      ownerUserId,
      calculationId,
      locale: "en",
      sourceLocator: {
        kind: "approved_interpretation",
        interpretationId: "00000000-0000-4000-8000-000000000007"
      },
      renderContract: "chart-natal-v3"
    });
  });

  it("rejects a non-natal calculation", async () => {
    const harness = createHarness({
      calculation: { ...calculation(), module: "numerology", methodCode: "pythagorean" }
    });

    const failure = await harness.service
      .latest(calculationId, { locale: "ru" }, request())
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(409);
  });

  it("rejects an archived chart before PDF lookup, storage or queue work", async () => {
    const harness = createHarness({
      calculation: calculation({ status: "archived" })
    });

    const failure = await harness.service
      .download(calculationId, jobId, request())
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getResponse()).toMatchObject({
      code: "CHART_CALCULATION_ARCHIVED"
    });
    expect(harness.calculationPdf.download).not.toHaveBeenCalled();
  });

  it("keeps child natal PDF lifecycle identical to adult natal", async () => {
    const harness = createHarness({ calculation: calculation({ interpretationMode: "child" }) });

    await expect(
      harness.service.enqueue(
        calculationId,
        { expectedResultChecksum: checksum, locale: "ru" },
        request()
      )
    ).resolves.toMatchObject({ job: { status: "queued" } });
    expect(harness.calculationPdf.request).toHaveBeenCalledOnce();
  });

  it("keeps legacy-unclassified natal PDF unavailable before queue work", async () => {
    const harness = createHarness({
      calculation: calculation({ interpretationMode: "legacy_unclassified" })
    });

    await expect(
      harness.service.enqueue(
        calculationId,
        { expectedResultChecksum: checksum, locale: "ru" },
        request()
      )
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "CHART_INTERPRETATION_MODE_UNAVAILABLE" })
    });
    expect(harness.calculationPdf.request).not.toHaveBeenCalled();
  });

  it("requires recalculation for a legacy natal chart before PDF side effects", async () => {
    const harness = createHarness({
      calculation: calculation({ resultData: legacyNatalResult() })
    });

    const failure = await harness.service
      .enqueue(calculationId, { expectedResultChecksum: checksum, locale: "ru" }, request())
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getResponse()).toMatchObject({
      code: "CHART_RECALCULATION_REQUIRED"
    });
    expect(harness.calculationPdf.request).not.toHaveBeenCalled();
  });

  it("rejects a current natal chart with a forged reproducibility fingerprint before PDF side effects", async () => {
    const harness = createHarness({
      calculation: calculation({
        resultData: {
          ...currentNatalResult(),
          reproducibilityFingerprint: `sha256:${"0".repeat(64)}`
        }
      })
    });

    const failure = await harness.service
      .enqueue(calculationId, { expectedResultChecksum: checksum, locale: "ru" }, request())
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getResponse()).toMatchObject({
      code: "CHART_STORED_RESULT_INTEGRITY_INVALID"
    });
    expect(harness.calculationPdf.request).not.toHaveBeenCalled();
  });

  it("rejects a current natal render mutation whose persisted checksum was not updated", async () => {
    const original = currentNatalResult();
    const harness = createHarness({
      calculation: calculation({
        resultData: {
          ...original,
          result: {
            ...original.result,
            points: [
              { ...original.result.points[0]!, longitude: 42 },
              ...original.result.points.slice(1)
            ]
          }
        },
        resultChecksum: sha256CanonicalJson(original as unknown as CanonicalJson)
      })
    });

    await expect(
      harness.service.latest(calculationId, { locale: "ru" }, request())
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_STORED_RESULT_INTEGRITY_INVALID" })
    });
    expect(harness.calculationPdf.latest).not.toHaveBeenCalled();
  });

  it("rejects a valid result produced by a non-current execution profile", async () => {
    const harness = createHarness({
      executionProfile: {
        ...executionProfile,
        expectedEphemeris: "swiss-ephemeris",
        expectedEphemerisFlags: ["FLG_SWIEPH", "FLG_SPEED"],
        expectedEphemerisDataRevision: `sha256:${"f".repeat(64)}`
      }
    });

    await expect(harness.service.download(calculationId, jobId, request())).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_STORED_RESULT_INTEGRITY_INVALID" })
    });
    expect(harness.calculationPdf.download).not.toHaveBeenCalled();
  });

  it("maps generic readiness errors to chart HTTP semantics", async () => {
    const harness = createHarness();
    harness.calculationPdf.download.mockRejectedValueOnce(new CalculationPdfNotReadyError());

    const failure = await harness.service
      .download(calculationId, jobId, request())
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getResponse()).toMatchObject({
      code: "CHART_PDF_NOT_READY"
    });
  });
});

function createHarness(
  input: {
    readonly calculation?: CalculationRecord;
    readonly executionProfile?: ChartExecutionProfile;
  } = {}
) {
  const currentCalculation = input.calculation ?? calculation();
  const calculationStore = {
    findByOwnerAndId: vi.fn(async () => currentCalculation)
  };
  const calculationPdf = {
    latest: vi.fn(async () => ({ job: null, currentResultChecksum: checksum })),
    request: vi.fn(async () => ({
      job: {
        id: jobId,
        calculationId,
        resultChecksum: checksum,
        locale: "ru",
        status: "queued",
        artifactId: "00000000-0000-4000-8000-000000000004",
        mediaAssetId: "00000000-0000-4000-8000-000000000005",
        failureReason: null,
        createdAt: "2026-07-22T12:00:00.000Z",
        updatedAt: "2026-07-22T12:00:00.000Z"
      },
      currentResultChecksum: checksum
    })),
    download: vi.fn(async () => ({
      url: "https://storage.example/chart.pdf?signature=abc",
      expiresAt: "2026-07-22T12:05:00.000Z"
    }))
  };
  const service = new ChartsPdfService(
    calculationStore as never,
    calculationPdf as never,
    {
      getProfile: () => input.executionProfile ?? executionProfile
    } as never
  );
  return { service, calculationPdf };
}

function calculation(overrides: Partial<CalculationRecord> = {}): CalculationRecord {
  const defaultResult = currentNatalResult();
  const resultData = overrides.resultData ?? defaultResult;
  const inputData = overrides.inputData ?? {
    inputSnapshot: defaultResult.inputSnapshot,
    settings: defaultResult.settings
  };
  const resultChecksum =
    overrides.resultChecksum ?? sha256CanonicalJson(resultData as unknown as CanonicalJson);
  return {
    id: calculationId,
    ownerUserId,
    module: "chart",
    mode: "individual",
    interpretationMode: "adult_natal",
    methodCode: "natal",
    title: "Мария Иванова",
    status: "linked",
    participants: [],
    requestFingerprint: `sha256:${"b".repeat(64)}`,
    inputData,
    resultData,
    resultSummary: {},
    resultChecksum,
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-07-22T12:00:00.000Z",
    updatedAt: "2026-07-22T12:00:00.000Z",
    ...overrides
  };
}

function currentNatalResult() {
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
    reproducibilityFingerprint: `sha256:${"c".repeat(64)}`,
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
      aspects: [],
      distributions: {
        elements: { fire: 3, earth: 3, air: 2, water: 2 },
        modalities: { cardinal: 4, fixed: 3, mutable: 3 },
        polarity: { masculine: 5, feminine: 5 }
      },
      warnings: []
    }
  });
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function legacyNatalResult() {
  const current = currentNatalResult();
  return {
    schemaVersion: "chart-result.v1",
    method: "natal",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: current.settings,
    inputSnapshot: current.inputSnapshot,
    result: current.result
  };
}

function interpretation(
  overrides: Partial<CalculationRecord["interpretations"][number]> = {}
): CalculationRecord["interpretations"][number] {
  return {
    id: "00000000-0000-4000-8000-000000000006",
    source: "ai",
    status: "approved",
    text: "Approved chart interpretation",
    modelId: "gpt-5.5",
    promptVersion: "chart.interpretationDraft@2",
    approvedAt: "2026-07-22T12:02:00.000Z",
    updatedAt: "2026-07-22T12:02:00.000Z",
    ...overrides
  };
}

function request() {
  return {
    currentAstrologerAccount: { account: { id: ownerUserId } }
  } as never;
}
