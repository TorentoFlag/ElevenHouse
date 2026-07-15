import { describe, expect, it } from "vitest";
import {
  generateMatrixReportAiDraftRequestSchema,
  matrixPdfDownloadResponseSchema,
  matrixPdfJobResponseSchema,
  matrixReportContentSchema,
  matrixReportResponseSchema,
  saveMatrixReportRequestSchema
} from "./matrix-report";

const calculationId = "00000000-0000-4000-8000-000000000001";
const reportId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const checksum = `sha256:${"a".repeat(64)}`;

describe("Matrix report contracts", () => {
  it("accepts one strict editable report structure", () => {
    expect(matrixReportContentSchema.parse(content())).toEqual(content());
    expect(matrixReportContentSchema.safeParse({ ...content(), unknown: true }).success).toBe(
      false
    );
    expect(matrixReportContentSchema.safeParse({ ...content(), overview: "   " }).success).toBe(
      false
    );
    expect(
      matrixReportContentSchema.safeParse({ ...content(), corePortrait: "x".repeat(5_001) }).success
    ).toBe(false);
  });

  it("requires checksum concurrency and explicit human report status", () => {
    expect(
      saveMatrixReportRequestSchema.parse({
        locale: "ru",
        status: "ready",
        content: content(),
        expectedResultChecksum: checksum
      })
    ).toMatchObject({ status: "ready", expectedResultChecksum: checksum });
    expect(
      saveMatrixReportRequestSchema.safeParse({
        locale: "ru",
        status: "approved",
        content: content(),
        expectedResultChecksum: checksum
      }).success
    ).toBe(false);
  });

  it("limits AI input to explicit note identities and an optional projection year", () => {
    expect(
      generateMatrixReportAiDraftRequestSchema.parse({
        locale: "en",
        noteIds: [reportId],
        projectionYear: 2027,
        expectedResultChecksum: checksum
      })
    ).toEqual({
      locale: "en",
      noteIds: [reportId],
      projectionYear: 2027,
      expectedResultChecksum: checksum
    });
    expect(
      generateMatrixReportAiDraftRequestSchema.safeParse({
        locale: "ru",
        noteIds: [reportId, reportId],
        projectionYear: null,
        expectedResultChecksum: checksum
      }).success
    ).toBe(false);
  });

  it("returns provenance, revision and derived stale state", () => {
    const parsed = matrixReportResponseSchema.parse({
      report: {
        id: reportId,
        calculationId,
        source: "ai",
        status: "draft",
        locale: "ru",
        content: content(),
        plainText: "Обзор\nТекст",
        resultChecksum: checksum,
        stale: false,
        revision: 2,
        modelId: "gpt-5.5",
        promptVersion: "matrix.reportDraft@1",
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z"
      },
      currentResultChecksum: checksum
    });
    expect(parsed.report).toMatchObject({ revision: 2, stale: false, source: "ai" });
  });

  it("models durable PDF progress and private expiring download", () => {
    expect(
      matrixPdfJobResponseSchema.parse({
        job: {
          id: jobId,
          calculationId,
          reportId,
          reportRevision: 2,
          resultChecksum: checksum,
          locale: "ru",
          status: "ready",
          artifactId: "00000000-0000-4000-8000-000000000004",
          mediaAssetId: "00000000-0000-4000-8000-000000000005",
          failureReason: null,
          createdAt: "2026-07-14T00:00:00.000Z",
          updatedAt: "2026-07-14T00:00:00.000Z"
        },
        currentResultChecksum: checksum
      }).job
    ).toMatchObject({ status: "ready", reportRevision: 2 });
    expect(
      matrixPdfDownloadResponseSchema.parse({
        url: "https://storage.example.test/private/report.pdf?signature=abc",
        expiresAt: "2026-07-14T00:05:00.000Z"
      }).url
    ).toContain("signature=");
    expect(
      matrixPdfJobResponseSchema.safeParse({
        job: {
          id: jobId,
          calculationId,
          reportId,
          reportRevision: 2,
          resultChecksum: checksum,
          locale: "ru",
          status: "ready",
          artifactId: null,
          mediaAssetId: null,
          failureReason: null,
          createdAt: "2026-07-14T00:00:00.000Z",
          updatedAt: "2026-07-14T00:00:00.000Z",
          documentFingerprint: checksum
        },
        currentResultChecksum: checksum
      }).success
    ).toBe(false);
  });
});

function content() {
  return {
    overview: "Краткий обзор.",
    corePortrait: "Ядро личности.",
    strengthsAndTalents: "Сильные стороны и таланты.",
    growthAreas: "Зоны роста.",
    moneyAndRealization: "Деньги и реализация.",
    relationships: "Отношения.",
    lineageThemes: "Родовые темы.",
    purposes: "Предназначения.",
    yearProjection: null,
    reflectionQuestions: ["Что сейчас важно заметить?"],
    practicalSteps: ["Записать один конкретный шаг."],
    disclaimer:
      "Материал предназначен для саморефлексии и не является профессиональной консультацией."
  };
}
