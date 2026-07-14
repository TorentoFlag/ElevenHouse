import { describe, expect, it, vi } from "vitest";
import type { PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3MatrixPdfObjectStorage } from "./matrix-pdf.storage";

const config = {
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  privateBucket: "elevenhouse-local-private",
  accessKeyId: "elevenhouse",
  secretAccessKey: "elevenhouse-secret",
  forcePathStyle: true
};

describe("createS3MatrixPdfObjectStorage", () => {
  it("uploads the PDF only to the configured private bucket with integrity metadata", async () => {
    const send = vi.fn(async (command: PutObjectCommand) => {
      void command;
      return {};
    });
    const storage = createS3MatrixPdfObjectStorage(config, { send });
    const bytes = Buffer.from("%PDF-test");

    await storage.putPdf({
      storageBucket: config.privateBucket,
      storageKey: "owner/matrix_report_pdf/job/report.pdf",
      originalFileName: "Матрица судьбы.pdf",
      bytes,
      checksumSha256: "a".repeat(64)
    });

    expect(send).toHaveBeenCalledOnce();
    const command = send.mock.calls[0]?.[0];
    if (!command) throw new Error("Expected S3 command");
    expect(command.input).toMatchObject({
      Bucket: config.privateBucket,
      Key: "owner/matrix_report_pdf/job/report.pdf",
      Body: bytes,
      ContentType: "application/pdf",
      ContentLength: bytes.length,
      Metadata: { "checksum-sha256": "a".repeat(64) }
    });
    expect(command.input.ContentDisposition).toContain("%D0%9C");
  });

  it("refuses public or unexpected buckets", async () => {
    const storage = createS3MatrixPdfObjectStorage(config, {
      send: vi.fn(async (command: PutObjectCommand) => {
        void command;
        return {};
      })
    });
    await expect(
      storage.putPdf({
        storageBucket: "elevenhouse-local-media",
        storageKey: "report.pdf",
        originalFileName: "report.pdf",
        bytes: Buffer.from("%PDF-test"),
        checksumSha256: "a".repeat(64)
      })
    ).rejects.toThrow("unexpected storage bucket");
  });
});
