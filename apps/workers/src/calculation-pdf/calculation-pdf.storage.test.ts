import type { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createS3CalculationPdfObjectStorage } from "./calculation-pdf.storage";

const config = {
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  privateBucket: "elevenhouse-local-private",
  accessKeyId: "elevenhouse",
  secretAccessKey: "elevenhouse-secret",
  forcePathStyle: true
};

describe("calculation PDF object storage", () => {
  it("uploads deterministic private PDF metadata", async () => {
    const send = vi.fn(
      async (_command: PutObjectCommand | DeleteObjectCommand | HeadBucketCommand) => ({})
    );
    const storage = createS3CalculationPdfObjectStorage(config, { send });
    const bytes = Buffer.from("%PDF-test");

    await storage.putPdf({
      storageBucket: config.privateBucket,
      storageKey: "owner/calculation_report_pdf/job/report.pdf",
      originalFileName: "Нумерология.pdf",
      bytes,
      checksumSha256: "a".repeat(64)
    });

    const command = send.mock.calls[0]?.[0] as PutObjectCommand | undefined;
    expect(command?.input).toMatchObject({
      Bucket: config.privateBucket,
      Key: "owner/calculation_report_pdf/job/report.pdf",
      Body: bytes,
      ContentType: "application/pdf",
      ContentLength: bytes.length,
      Metadata: { "checksum-sha256": "a".repeat(64) }
    });
    expect(command?.input.ContentDisposition).toContain("%D0%9D");
  });

  it("uses idempotent S3 deletion and rejects unexpected buckets", async () => {
    const send = vi.fn(
      async (_command: PutObjectCommand | DeleteObjectCommand | HeadBucketCommand) => ({})
    );
    const storage = createS3CalculationPdfObjectStorage(config, { send });

    await storage.deletePdf({
      storageBucket: config.privateBucket,
      storageKey: "owner/calculation_report_pdf/job/report.pdf"
    });
    const command = send.mock.calls[0]?.[0] as DeleteObjectCommand | undefined;
    expect(command?.input).toEqual({
      Bucket: config.privateBucket,
      Key: "owner/calculation_report_pdf/job/report.pdf"
    });
    await expect(
      storage.deletePdf({ storageBucket: "public", storageKey: "report.pdf" })
    ).rejects.toThrow("unexpected storage bucket");
  });

  it("checks readiness against the configured private bucket", async () => {
    const send = vi.fn(
      async (_command: PutObjectCommand | DeleteObjectCommand | HeadBucketCommand) => ({})
    );
    const storage = createS3CalculationPdfObjectStorage(config, { send });

    await storage.checkReady();

    const command = send.mock.calls[0]?.[0] as HeadBucketCommand | undefined;
    expect(command?.input).toEqual({ Bucket: config.privateBucket });
  });
});
