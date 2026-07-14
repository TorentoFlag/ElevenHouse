import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSignedUrl = vi.hoisted(() =>
  vi.fn(async (client: unknown, command: unknown, options: unknown) => {
    void client;
    void command;
    void options;
    return "https://storage.example/signed";
  })
);
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl }));

import { S3MediaObjectStorage, type S3MediaObjectStorageConfig } from "./s3-media-object-storage";

const config: S3MediaObjectStorageConfig = {
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  bucket: "elevenhouse-local-media",
  privateBucket: "elevenhouse-local-private",
  accessKeyId: "elevenhouse",
  secretAccessKey: "secret",
  forcePathStyle: true,
  publicBaseUrl: "http://localhost:9000/elevenhouse-local-media",
  uploadTtlSeconds: 900,
  downloadTtlSeconds: 300
};

describe("S3MediaObjectStorage private downloads", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));
    getSignedUrl.mockClear();
  });

  afterEach(() => vi.useRealTimers());

  it("signs a short-lived attachment from the configured private bucket", async () => {
    const storage = new S3MediaObjectStorage(config, {} as S3Client);
    await expect(
      storage.createPresignedDownload({
        storageBucket: config.privateBucket,
        storageKey: "owner/matrix_report_pdf/job/report.pdf",
        fileName: "Матрица судьбы.pdf"
      })
    ).resolves.toEqual({
      url: "https://storage.example/signed",
      expiresAt: "2026-07-14T12:05:00.000Z"
    });
    expect(getSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.any(GetObjectCommand), {
      expiresIn: 300
    });
    const command = getSignedUrl.mock.calls[0]![1] as GetObjectCommand;
    expect(command.input).toMatchObject({
      Bucket: config.privateBucket,
      Key: "owner/matrix_report_pdf/job/report.pdf",
      ResponseContentType: "application/pdf"
    });
    expect(command.input.ResponseContentDisposition).toContain("attachment;");
  });

  it("refuses to sign an object from the public bucket", async () => {
    const storage = new S3MediaObjectStorage(config, {} as S3Client);
    await expect(
      storage.createPresignedDownload({
        storageBucket: config.bucket,
        storageKey: "owner/matrix_report_pdf/job/report.pdf",
        fileName: "report.pdf"
      })
    ).rejects.toThrow("unexpected storage bucket");
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});
