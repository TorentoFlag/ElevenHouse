import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { CalculationRecord } from "@elevenhouse/domain";
import { CalculationPdfNotReadyError } from "../calculations/pdf/calculation-pdf.errors";
import { NumerologyPdfService } from "./numerology-pdf.service";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const calculationId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const latestInterpretationId = "00000000-0000-4000-8000-000000000006";
const checksum = `sha256:${"a".repeat(64)}`;

describe("NumerologyPdfService", () => {
  it("requests a current Pythagorean PDF with the newest approved interpretation", async () => {
    const harness = createHarness();

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
        interpretationId: latestInterpretationId
      },
      renderContract: "numerology-pythagorean",
      originalFileName: "Нумерология.pdf"
    });
  });

  it("allows deterministic export when only drafts exist", async () => {
    const record = calculation();
    const harness = createHarness({
      calculation: { ...record, interpretations: [record.interpretations[0]!] }
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
        originalFileName: "Numerology.pdf"
      })
    );
  });

  it("restores latest locale-specific state", async () => {
    const harness = createHarness();

    await harness.service.latest(calculationId, { locale: "en" }, request());
    expect(harness.calculationPdf.latest).toHaveBeenCalledWith({
      ownerUserId,
      calculationId,
      locale: "en"
    });
  });

  it("rejects a non-Pythagorean calculation", async () => {
    const harness = createHarness({
      calculation: { ...calculation(), module: "matrix", methodCode: "ladini_22" }
    });

    const failure = await harness.service
      .latest(calculationId, { locale: "ru" }, request())
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(409);
  });

  it("maps generic readiness errors to Numerology HTTP semantics", async () => {
    const harness = createHarness();
    harness.calculationPdf.download.mockRejectedValueOnce(new CalculationPdfNotReadyError());

    const failure = await harness.service
      .download(calculationId, jobId, request())
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getResponse()).toMatchObject({
      code: "NUMEROLOGY_PDF_NOT_READY"
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
        createdAt: "2026-07-15T12:00:00.000Z",
        updatedAt: "2026-07-15T12:00:00.000Z"
      },
      currentResultChecksum: checksum
    })),
    download: vi.fn(async () => ({
      url: "https://storage.example/private.pdf?signature=abc",
      expiresAt: "2026-07-15T12:05:00.000Z"
    }))
  };
  const service = new NumerologyPdfService(calculationStore as never, calculationPdf as never);
  return { service, calculationPdf };
}

function calculation(): CalculationRecord {
  return {
    id: calculationId,
    ownerUserId,
    module: "numerology",
    mode: "individual",
    methodCode: "pythagorean",
    title: "Голубев Антон",
    status: "linked",
    participants: [],
    requestFingerprint: `sha256:${"b".repeat(64)}`,
    inputData: {},
    resultData: {},
    resultSummary: {},
    resultChecksum: checksum,
    links: [],
    interpretations: [
      {
        id: "00000000-0000-4000-8000-000000000004",
        source: "ai",
        status: "draft",
        text: "Нельзя включать",
        modelId: "secret",
        promptVersion: "secret",
        approvedAt: null,
        updatedAt: "2026-07-15T12:04:00.000Z"
      },
      {
        id: "00000000-0000-4000-8000-000000000005",
        source: "manual",
        status: "approved",
        text: "Старое утверждённое",
        modelId: null,
        promptVersion: null,
        approvedAt: "2026-07-15T12:01:00.000Z",
        updatedAt: "2026-07-15T12:05:00.000Z"
      },
      {
        id: latestInterpretationId,
        source: "manual",
        status: "approved",
        text: "Текущее утверждённое",
        modelId: null,
        promptVersion: null,
        approvedAt: "2026-07-15T12:02:00.000Z",
        updatedAt: "2026-07-15T12:03:00.000Z"
      }
    ],
    artifacts: [],
    createdAt: "2026-07-15T12:00:00.000Z",
    updatedAt: "2026-07-15T12:00:00.000Z"
  };
}

function request() {
  return {
    currentAstrologerAccount: { account: { id: ownerUserId } }
  } as never;
}
