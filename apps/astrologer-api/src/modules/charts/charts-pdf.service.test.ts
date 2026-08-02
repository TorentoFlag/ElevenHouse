import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { CalculationRecord } from "@elevenhouse/domain";
import { CalculationPdfNotReadyError } from "../calculations/pdf/calculation-pdf.errors";
import { ChartsPdfService } from "./charts-pdf.service";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const calculationId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const checksum = `sha256:${"a".repeat(64)}`;

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
      renderContract: "chart-natal-v1",
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
      renderContract: "chart-natal-v1"
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

function createHarness(input: { readonly calculation?: CalculationRecord } = {}) {
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
  const service = new ChartsPdfService(calculationStore as never, calculationPdf as never);
  return { service, calculationPdf };
}

function calculation(overrides: Partial<CalculationRecord> = {}): CalculationRecord {
  return {
    id: calculationId,
    ownerUserId,
    module: "chart",
    mode: "individual",
    methodCode: "natal",
    title: "Мария Иванова",
    status: "linked",
    participants: [],
    requestFingerprint: `sha256:${"b".repeat(64)}`,
    inputData: {},
    resultData: {},
    resultSummary: {},
    resultChecksum: checksum,
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-07-22T12:00:00.000Z",
    updatedAt: "2026-07-22T12:00:00.000Z",
    ...overrides
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
