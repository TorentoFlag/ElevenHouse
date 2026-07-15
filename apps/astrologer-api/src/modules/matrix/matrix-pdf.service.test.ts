import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  type CalculationPdfJob,
  type CalculationRecord,
  type MatrixReportDraft,
  type MatrixReportStore
} from "@elevenhouse/domain";
import { CalculationPdfResultChangedError } from "../calculations/pdf/calculation-pdf.errors";
import { MatrixPdfService } from "./matrix-pdf.service";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const calculationId = "00000000-0000-4000-8000-000000000002";
const reportId = "00000000-0000-4000-8000-000000000003";
const jobId = "00000000-0000-4000-8000-000000000004";
const checksum = `sha256:${"a".repeat(64)}`;
const now = "2026-07-15T12:00:00.000Z";

describe("MatrixPdfService", () => {
  it("returns Matrix-compatible fields from the generic current job", async () => {
    const harness = createHarness();

    await expect(harness.service.latest(calculationId, request())).resolves.toMatchObject({
      currentResultChecksum: checksum,
      job: { id: jobId, reportId, reportRevision: 2 }
    });
  });

  it("requests the generic document from one ready current Matrix report", async () => {
    const harness = createHarness();

    await expect(
      harness.service.enqueue(calculationId, { expectedResultChecksum: checksum }, request())
    ).resolves.toMatchObject({ job: { id: jobId, reportId, reportRevision: 2 } });
    expect(harness.calculationPdf.request).toHaveBeenCalledWith({
      ownerUserId,
      calculationId,
      expectedResultChecksum: checksum,
      locale: "ru",
      sourceLocator: {
        kind: "matrix_report",
        reportId,
        reportRevision: 2,
        reportResultChecksum: checksum
      },
      renderContract: "matrix-ladini-22",
      originalFileName: "Матрица судьбы.pdf"
    });
  });

  it("keeps Matrix error semantics when the generic current checksum changes", async () => {
    const harness = createHarness();
    harness.calculationPdf.download.mockRejectedValueOnce(new CalculationPdfResultChangedError());

    const failure = await harness.service
      .download(calculationId, jobId, request())
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(409);
    expect((failure as HttpException).getResponse()).toMatchObject({
      code: "MATRIX_RESULT_CHANGED"
    });
  });
});

function createHarness() {
  const currentCalculation = calculation();
  const currentJob = pdfJob();
  const calculationStore = {
    findByOwnerAndId: vi.fn(async () => currentCalculation)
  };
  const reportStore: MatrixReportStore = {
    findByCalculation: vi.fn(async () => report()),
    upsert: vi.fn()
  };
  const calculationPdf = {
    latestJob: vi.fn(async () => ({ calculation: currentCalculation, job: currentJob })),
    request: vi.fn(async () => ({
      currentResultChecksum: checksum,
      job: publicJob(currentJob)
    })),
    download: vi.fn(async () => ({
      url: "https://storage.example/private.pdf?signature=abc",
      expiresAt: "2026-07-15T12:05:00.000Z"
    }))
  };
  const service = new MatrixPdfService(
    calculationStore as never,
    reportStore,
    calculationPdf as never
  );
  return { service, calculationPdf };
}

function calculation(): CalculationRecord {
  return {
    id: calculationId,
    ownerUserId,
    module: "matrix",
    mode: "individual",
    methodCode: "ladini_22",
    title: "Матрица",
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
    createdAt: now,
    updatedAt: now
  };
}

function report(): MatrixReportDraft {
  return {
    id: reportId,
    calculationId,
    ownerUserId,
    source: "manual",
    status: "ready",
    locale: "ru",
    content: {
      overview: "Обзор",
      corePortrait: "Ядро",
      strengthsAndTalents: "Сильные стороны",
      growthAreas: "Рост",
      moneyAndRealization: "Деньги",
      relationships: "Отношения",
      lineageThemes: "Род",
      purposes: "Цели",
      yearProjection: null,
      reflectionQuestions: ["Вопрос"],
      practicalSteps: ["Шаг"],
      disclaimer: "Дисклеймер"
    },
    plainText: "Отчёт",
    resultChecksum: checksum,
    revision: 2,
    modelId: null,
    promptVersion: null,
    createdAt: now,
    updatedAt: now
  };
}

function pdfJob(): CalculationPdfJob {
  return {
    id: jobId,
    calculationId,
    ownerUserId,
    module: "matrix",
    methodCode: "ladini_22",
    resultChecksum: checksum,
    locale: "ru",
    sourceLocator: {
      kind: "matrix_report",
      reportId,
      reportRevision: 2,
      reportResultChecksum: checksum
    },
    documentFingerprint: `sha256:${"c".repeat(64)}`,
    status: "queued",
    artifactId: "00000000-0000-4000-8000-000000000005",
    mediaAssetId: "00000000-0000-4000-8000-000000000006",
    failureCode: null,
    failureReason: null,
    pageCount: null,
    createdAt: now,
    updatedAt: now
  };
}

function publicJob(job: CalculationPdfJob) {
  return {
    id: job.id,
    calculationId: job.calculationId,
    resultChecksum: job.resultChecksum,
    locale: job.locale,
    status: job.status,
    artifactId: job.artifactId,
    mediaAssetId: job.mediaAssetId,
    failureReason: null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

function request() {
  return {
    currentAstrologerAccount: { account: { id: ownerUserId } }
  } as never;
}
