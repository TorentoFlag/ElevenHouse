import { describe, expect, it } from "vitest";
import {
  assertCalculationPdfTargetsCurrentResult,
  calculationPdfDocumentFingerprint,
  isReusableCalculationPdfJob,
  normalizeCalculationPdfSourceLocator,
  publicCalculationPdfFailureReason
} from "./calculation-pdf-use-cases";
import { CalculationResultChangedError, CalculationValidationError } from "../calculation-errors";
import type { CalculationPdfJob } from "./calculation-pdf-types";

const checksum = `sha256:${"a".repeat(64)}`;
const nextChecksum = `sha256:${"b".repeat(64)}`;

describe("calculation PDF use cases", () => {
  it("normalizes strict method source locators", () => {
    expect(
      normalizeCalculationPdfSourceLocator({
        kind: "matrix_report",
        reportId: "report-1",
        reportRevision: 2,
        reportResultChecksum: checksum
      })
    ).toEqual({
      kind: "matrix_report",
      reportId: "report-1",
      reportRevision: 2,
      reportResultChecksum: checksum
    });
    expect(
      normalizeCalculationPdfSourceLocator({
        kind: "approved_interpretation",
        interpretationId: null
      })
    ).toEqual({ kind: "approved_interpretation", interpretationId: null });
    expect(() =>
      normalizeCalculationPdfSourceLocator({
        kind: "matrix_report",
        reportId: "report-1",
        reportRevision: 0,
        reportResultChecksum: checksum
      })
    ).toThrow(CalculationValidationError);
    expect(() =>
      normalizeCalculationPdfSourceLocator({
        kind: "approved_interpretation",
        interpretationId: null,
        promptVersion: "secret"
      })
    ).toThrow(CalculationValidationError);
  });

  it("rejects a request that does not target the current result", () => {
    expect(
      assertCalculationPdfTargetsCurrentResult({
        currentResultChecksum: checksum,
        expectedResultChecksum: checksum
      })
    ).toBe(checksum);
    expect(() =>
      assertCalculationPdfTargetsCurrentResult({
        currentResultChecksum: checksum,
        expectedResultChecksum: nextChecksum
      })
    ).toThrow(CalculationResultChangedError);
  });

  it("creates a deterministic fingerprint from only deployed document inputs", () => {
    const left = calculationPdfDocumentFingerprint({
      resultChecksum: checksum,
      locale: "ru",
      sourceLocator: {
        kind: "approved_interpretation",
        interpretationId: "interpretation-1"
      },
      renderContract: "numerology-pythagorean"
    });
    const right = calculationPdfDocumentFingerprint({
      renderContract: "numerology-pythagorean",
      sourceLocator: {
        interpretationId: "interpretation-1",
        kind: "approved_interpretation"
      },
      locale: "ru",
      resultChecksum: checksum
    });

    expect(left).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(right).toBe(left);
    expect(
      calculationPdfDocumentFingerprint({
        resultChecksum: checksum,
        locale: "en",
        sourceLocator: {
          kind: "approved_interpretation",
          interpretationId: "interpretation-1"
        },
        renderContract: "numerology-pythagorean"
      })
    ).not.toBe(left);
  });

  it("reuses only the same owner's current non-failed document", () => {
    const job = pdfJob();
    expect(
      isReusableCalculationPdfJob(job, {
        ownerUserId: job.ownerUserId,
        calculationId: job.calculationId,
        resultChecksum: job.resultChecksum,
        locale: job.locale,
        documentFingerprint: job.documentFingerprint
      })
    ).toBe(true);
    expect(
      isReusableCalculationPdfJob(
        { ...job, status: "failed" },
        {
          ownerUserId: job.ownerUserId,
          calculationId: job.calculationId,
          resultChecksum: job.resultChecksum,
          locale: job.locale,
          documentFingerprint: job.documentFingerprint
        }
      )
    ).toBe(false);
    expect(
      isReusableCalculationPdfJob(job, {
        ownerUserId: "other-owner",
        calculationId: job.calculationId,
        resultChecksum: job.resultChecksum,
        locale: job.locale,
        documentFingerprint: job.documentFingerprint
      })
    ).toBe(false);
  });

  it("never exposes an internal failure reason", () => {
    expect(publicCalculationPdfFailureReason({ ...pdfJob(), status: "failed" })).toBe(
      "PDF generation failed. Please try again."
    );
    expect(publicCalculationPdfFailureReason(pdfJob())).toBeNull();
  });
});

function pdfJob(): CalculationPdfJob {
  return {
    id: "job-1",
    calculationId: "calculation-1",
    ownerUserId: "owner-1",
    module: "numerology",
    methodCode: "pythagorean_ru",
    resultChecksum: checksum,
    locale: "ru",
    sourceLocator: { kind: "approved_interpretation", interpretationId: null },
    documentFingerprint: `sha256:${"c".repeat(64)}`,
    status: "queued",
    artifactId: "artifact-1",
    mediaAssetId: "media-1",
    failureCode: null,
    failureReason: "s3 credentials: do not expose",
    pageCount: null,
    createdAt: "2026-07-15T10:00:00.000Z",
    updatedAt: "2026-07-15T10:00:00.000Z"
  };
}
