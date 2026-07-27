import { PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createS3MessagingMediaObjectStorage } from "./messaging-media-ingestion.storage";

const config = {
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  privateBucket: "elevenhouse-local-private",
  accessKeyId: "elevenhouse",
  secretAccessKey: "elevenhouse-secret",
  forcePathStyle: true
};

describe("S3 messaging media object storage", () => {
  it("uploads private audio objects with checksum metadata", async () => {
    const send = vi.fn(async () => undefined);
    const storage = createS3MessagingMediaObjectStorage(config, { send });

    await storage.putPrivateObject({
      storageBucket: "elevenhouse-local-private",
      storageKey: "owner/messaging_attachment/media/telegram-voice.ogg",
      body: new Uint8Array([79, 103, 103, 83]),
      mimeType: "audio/ogg",
      checksumSha256: "a".repeat(64)
    });

    expect(send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    const calls = send.mock.calls as unknown as [[PutObjectCommand]];
    const command = calls[0][0];
    expect(command.input).toMatchObject({
      Bucket: "elevenhouse-local-private",
      Key: "owner/messaging_attachment/media/telegram-voice.ogg",
      ContentType: "audio/ogg",
      ContentLength: 4,
      Metadata: { "checksum-sha256": "a".repeat(64) }
    });
    expect(command.input.ContentDisposition).toContain("inline;");
  });

  it("rejects unexpected buckets and invalid checksums", async () => {
    const send = vi.fn(async () => undefined);
    const storage = createS3MessagingMediaObjectStorage(config, { send });

    await expect(
      storage.putPrivateObject({
        storageBucket: "public",
        storageKey: "audio.ogg",
        body: new Uint8Array([1]),
        mimeType: "audio/ogg",
        checksumSha256: "a".repeat(64)
      })
    ).rejects.toThrow("unexpected storage bucket");
    await expect(
      storage.putPrivateObject({
        storageBucket: "elevenhouse-local-private",
        storageKey: "audio.ogg",
        body: new Uint8Array([1]),
        mimeType: "audio/ogg",
        checksumSha256: "bad"
      })
    ).rejects.toThrow("checksum is invalid");
    expect(send).not.toHaveBeenCalled();
  });
});
