import type { CalculationPdfJob, CalculationRecord, MatrixReportDraft } from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { CalculationPdfPermanentError } from "./calculation-pdf.registry";
import { createMatrixPdfSource } from "./matrix-pdf.source";

describe("Matrix PDF source", () => {
  it("assembles only the current ready report selected by the locator", async () => {
    const harness = createHarness();

    await expect(harness.source.load(pdfJob())).resolves.toMatchObject({
      kind: "matrix",
      locale: "ru",
      content: { overview: "Обзор" }
    });
    expect(harness.reportStore.findByCalculation).toHaveBeenCalledWith({
      ownerUserId: pdfJob().ownerUserId,
      calculationId: pdfJob().calculationId
    });
  });

  it.each([
    { sourceLocator: { ...locator(), reportRevision: 1 } },
    { sourceLocator: { ...locator(), reportResultChecksum: `sha256:${"f".repeat(64)}` } },
    { resultChecksum: `sha256:${"e".repeat(64)}` }
  ])("rejects stale job/report identity %#", async (override) => {
    const harness = createHarness();
    await expect(harness.source.load(pdfJob(override as never))).rejects.toBeInstanceOf(
      CalculationPdfPermanentError
    );
  });

  it("rejects a draft or foreign calculation", async () => {
    const draft = createHarness({ report: { ...report(), status: "draft" } });
    await expect(draft.source.load(pdfJob())).rejects.toMatchObject({ code: "stale_source" });
    const foreign = createHarness({ calculation: null });
    await expect(foreign.source.load(pdfJob())).rejects.toMatchObject({ code: "stale_source" });
  });
});

function createHarness(
  input: {
    readonly calculation?: CalculationRecord | null;
    readonly report?: MatrixReportDraft | null;
  } = {}
) {
  const calculationStore = {
    findByOwnerAndId: vi.fn(async () =>
      input.calculation === undefined ? calculation() : input.calculation
    )
  };
  const reportStore = {
    findByCalculation: vi.fn(async () => (input.report === undefined ? report() : input.report))
  };
  return {
    source: createMatrixPdfSource(calculationStore as never, reportStore as never),
    reportStore
  };
}

function pdfJob(overrides: Partial<CalculationPdfJob> = {}): CalculationPdfJob {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    calculationId: "00000000-0000-4000-8000-000000000002",
    ownerUserId: "00000000-0000-4000-8000-000000000003",
    module: "matrix",
    methodCode: "ladini_22",
    resultChecksum: `sha256:${"a".repeat(64)}`,
    locale: "ru",
    sourceLocator: locator(),
    documentFingerprint: `sha256:${"b".repeat(64)}`,
    status: "processing",
    artifactId: "00000000-0000-4000-8000-000000000005",
    mediaAssetId: "00000000-0000-4000-8000-000000000006",
    failureCode: null,
    failureReason: null,
    pageCount: null,
    createdAt: "2026-07-15T12:00:00.000Z",
    updatedAt: "2026-07-15T12:00:00.000Z",
    ...overrides
  };
}

function locator() {
  return {
    kind: "matrix_report" as const,
    reportId: "00000000-0000-4000-8000-000000000004",
    reportRevision: 2,
    reportResultChecksum: `sha256:${"a".repeat(64)}`
  };
}

function calculation(): CalculationRecord {
  return {
    id: pdfJob().calculationId,
    ownerUserId: pdfJob().ownerUserId,
    module: "matrix",
    mode: "individual",
    methodCode: "ladini_22",
    title: "Матрица судьбы",
    status: "linked",
    participants: [],
    requestFingerprint: `sha256:${"c".repeat(64)}`,
    inputData: {},
    resultData: {},
    resultSummary: {},
    resultChecksum: pdfJob().resultChecksum,
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: pdfJob().createdAt,
    updatedAt: pdfJob().updatedAt
  };
}

function report(): MatrixReportDraft {
  return {
    id: locator().reportId,
    calculationId: pdfJob().calculationId,
    ownerUserId: pdfJob().ownerUserId,
    source: "manual",
    status: "ready",
    locale: "ru",
    content: reportContent("Обзор"),
    plainText: "Обзор",
    resultChecksum: pdfJob().resultChecksum,
    revision: locator().reportRevision,
    modelId: "must-not-enter-document",
    promptVersion: "must-not-enter-document",
    createdAt: pdfJob().createdAt,
    updatedAt: pdfJob().updatedAt
  };
}

export function reportContent(overview: string) {
  return {
    overview,
    corePortrait: "Портрет",
    strengthsAndTalents: "Таланты",
    growthAreas: "Рост",
    moneyAndRealization: "Деньги",
    relationships: "Отношения",
    lineageThemes: "Род",
    purposes: "Цели",
    yearProjection: null,
    reflectionQuestions: ["Что важно?"],
    practicalSteps: ["Сделать шаг"],
    disclaimer: "Для рефлексии"
  };
}
