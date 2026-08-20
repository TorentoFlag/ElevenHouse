import { describe, expect, it } from "vitest";

import { S3MediaObjectStorage } from "./s3-media-object-storage";

describe("S3 media object storage", () => {
  it("creates upload URLs in the configured upload bucket", async () => {
    const storage = new S3MediaObjectStorage({
      endpoint: "https://media.example",
      region: "eu-central-1",
      bucket: "private-diary",
      privateBucket: "private-diary",
      accessKeyId: "access",
      secretAccessKey: "secret",
      forcePathStyle: true,
      publicBaseUrl: "https://cdn.example",
      uploadTtlSeconds: 900,
      downloadTtlSeconds: 300
    });

    const upload = await storage.createPresignedUpload({
      storageKey: "astro-diary/journal/media/file.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024
    });

    expect(upload).toMatchObject({
      bucket: "private-diary",
      method: "PUT",
      headers: { "content-type": "application/pdf" }
    });
    expect(upload.url).toContain("astro-diary/journal/media/file.pdf");
  });
});
