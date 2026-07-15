import { describe, expect, it } from "vitest";
import {
  calculationPdfDownloadResponseSchema,
  calculationPdfJobIdParamSchema,
  calculationPdfJobResponseSchema,
  calculationPdfJobSchema,
  requestCalculationPdfSchema
} from "./calculation-pdf";

const calculationId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
const checksum = `sha256:${"a".repeat(64)}`;

describe("calculation PDF contracts", () => {
  it("accepts a strict locale-aware request for the current result", () => {
    expect(
      requestCalculationPdfSchema.parse({
        expectedResultChecksum: checksum,
        locale: "ru"
      })
    ).toEqual({ expectedResultChecksum: checksum, locale: "ru" });

    expect(
      requestCalculationPdfSchema.safeParse({
        expectedResultChecksum: checksum,
        locale: "de"
      }).success
    ).toBe(false);
    expect(
      requestCalculationPdfSchema.safeParse({
        expectedResultChecksum: "sha256:invalid",
        locale: "en"
      }).success
    ).toBe(false);
    expect(
      requestCalculationPdfSchema.safeParse({
        expectedResultChecksum: checksum,
        locale: "en",
        model: "secret"
      }).success
    ).toBe(false);
  });

  it("models durable progress without internal source or storage metadata", () => {
    const job = calculationPdfJobSchema.parse({
      id: jobId,
      calculationId,
      resultChecksum: checksum,
      locale: "en",
      status: "ready",
      artifactId: "00000000-0000-4000-8000-000000000003",
      mediaAssetId: "00000000-0000-4000-8000-000000000004",
      failureReason: null,
      createdAt: "2026-07-15T10:00:00.000Z",
      updatedAt: "2026-07-15T10:01:00.000Z"
    });

    expect(job).toMatchObject({ status: "ready", locale: "en" });
    expect(
      calculationPdfJobSchema.safeParse({
        ...job,
        sourceLocator: { kind: "approved_interpretation", interpretationId: null }
      }).success
    ).toBe(false);
    expect(
      calculationPdfJobSchema.safeParse({
        ...job,
        storageKey: "private/secret.pdf"
      }).success
    ).toBe(false);
  });

  it("supports an absent job and bounded public failure text", () => {
    expect(
      calculationPdfJobResponseSchema.parse({
        job: null,
        currentResultChecksum: checksum
      })
    ).toEqual({ job: null, currentResultChecksum: checksum });

    expect(
      calculationPdfJobSchema.safeParse({
        id: jobId,
        calculationId,
        resultChecksum: checksum,
        locale: "ru",
        status: "failed",
        artifactId: null,
        mediaAssetId: null,
        failureReason: "x".repeat(501),
        createdAt: "2026-07-15T10:00:00.000Z",
        updatedAt: "2026-07-15T10:01:00.000Z"
      }).success
    ).toBe(false);
  });

  it("validates owner-scoped route parameters and expiring download responses", () => {
    expect(calculationPdfJobIdParamSchema.parse({ calculationId, jobId })).toEqual({
      calculationId,
      jobId
    });
    expect(
      calculationPdfDownloadResponseSchema.parse({
        url: "https://storage.example.test/private/report.pdf?signature=abc",
        expiresAt: "2026-07-15T10:05:00.000Z"
      })
    ).toMatchObject({ expiresAt: "2026-07-15T10:05:00.000Z" });
  });
});
