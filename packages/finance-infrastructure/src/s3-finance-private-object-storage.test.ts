import { createHash } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import {
  FinancePrivateObjectStorageError,
  createS3FinancePrivateObjectStorage
} from "./s3-finance-private-object-storage";

const config = {
  endpoint: "https://s3.example.test",
  region: "eu-central-1",
  bucket: "elevenhouse-finance-private",
  accessKeyId: "access-key",
  secretAccessKey: "secret-key",
  forcePathStyle: false,
  kmsKeyArn: "arn:aws:kms:eu-central-1:123456789012:key/4b456f46-bf3c-4764-9c1b-381e8c69a545"
} as const;
const bytes = Buffer.from('{"kind":"checkout_session_create"}', "utf8");
const sha256Digest = digest(bytes);

describe("createS3FinancePrivateObjectStorage", () => {
  it("checks the exact private bucket before the worker accepts provider dispatch", async () => {
    const send = vi.fn(async (command: unknown) => {
      void command;
      return {};
    });
    const storage = createS3FinancePrivateObjectStorage(config, { send });

    await expect(storage.checkReady()).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(expect.any(HeadBucketCommand));
    expect((send.mock.calls[0]?.[0] as HeadBucketCommand).input).toEqual({
      Bucket: config.bucket
    });
  });

  it("writes an immutable versioned SSE-KMS object with an independently checked digest", async () => {
    const send = vi.fn(async (command: unknown) => {
      void command;
      return { VersionId: "version-1" };
    });
    const storage = createS3FinancePrivateObjectStorage(config, { send });

    await expect(
      storage.writeImmutable({
        artifactId: "artifact-1",
        contentType: "application/json",
        bytes,
        expectedSha256Digest: sha256Digest
      })
    ).resolves.toEqual({
      privateObjectKey: "finance/artifacts/artifact-1.json",
      privateObjectVersion: "version-1",
      envelopeKeyVersion: config.kmsKeyArn,
      sha256Digest,
      byteLength: bytes.length,
      contentType: "application/json"
    });

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toMatchObject({
      Bucket: config.bucket,
      Key: "finance/artifacts/artifact-1.json",
      ContentType: "application/json",
      ContentLength: bytes.length,
      IfNoneMatch: "*",
      ServerSideEncryption: "aws:kms",
      SSEKMSKeyId: config.kmsKeyArn,
      ChecksumSHA256: Buffer.from(sha256Digest.slice("sha256:".length), "hex").toString("base64"),
      Metadata: {
        "finance-sha256": sha256Digest,
        "finance-content-type": "application/json"
      }
    });
  });

  it("rejects a bad plaintext digest before sending anything to storage", async () => {
    const send = vi.fn(async (command: unknown) => {
      void command;
      return { VersionId: "version-1" };
    });
    const storage = createS3FinancePrivateObjectStorage(config, { send });

    await expect(
      storage.writeImmutable({
        artifactId: "artifact-1",
        contentType: "application/json",
        bytes,
        expectedSha256Digest: digest(Buffer.from("tampered"))
      })
    ).rejects.toEqual(expect.objectContaining({ reason: "invalid_input" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an unversioned write so the finance registry can never bind a mutable object", async () => {
    const send = vi.fn(async (command: unknown) => {
      void command;
      return {};
    });
    const storage = createS3FinancePrivateObjectStorage(config, { send });

    await expect(
      storage.writeImmutable({
        artifactId: "artifact-1",
        contentType: "application/json",
        bytes,
        expectedSha256Digest: sha256Digest
      })
    ).rejects.toEqual(expect.objectContaining({ reason: "write_unversioned" }));
  });

  it("recovers an already-written exact immutable object after a retry without creating another version", async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof PutObjectCommand) {
        throw Object.assign(new Error("already exists"), {
          name: "PreconditionFailed",
          $metadata: { httpStatusCode: 412 }
        });
      }
      if (command instanceof GetObjectCommand) {
        return {
          Body: { transformToByteArray: async () => bytes },
          VersionId: "version-1",
          ContentType: "application/json",
          ContentLength: bytes.length,
          Metadata: {
            "finance-sha256": sha256Digest,
            "finance-content-type": "application/json"
          }
        };
      }
      throw new Error("unexpected command");
    });
    const storage = createS3FinancePrivateObjectStorage(config, { send });

    await expect(
      storage.writeImmutable({
        artifactId: "artifact-1",
        contentType: "application/json",
        bytes,
        expectedSha256Digest: sha256Digest
      })
    ).resolves.toMatchObject({
      privateObjectKey: "finance/artifacts/artifact-1.json",
      privateObjectVersion: "version-1",
      sha256Digest
    });
    expect(send.mock.calls.map(([command]) => command)).toEqual([
      expect.any(PutObjectCommand),
      expect.any(GetObjectCommand)
    ]);
  });

  it("fails closed when an already-written object is not the exact requested evidence", async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof PutObjectCommand) {
        throw Object.assign(new Error("already exists"), {
          name: "PreconditionFailed",
          $metadata: { httpStatusCode: 412 }
        });
      }
      if (command instanceof GetObjectCommand) {
        return {
          Body: { transformToByteArray: async () => Buffer.from("different") },
          VersionId: "version-1",
          ContentType: "application/json",
          ContentLength: 9,
          Metadata: {
            "finance-sha256": digest(Buffer.from("different")),
            "finance-content-type": "application/json"
          }
        };
      }
      throw new Error("unexpected command");
    });
    const storage = createS3FinancePrivateObjectStorage(config, { send });

    await expect(
      storage.writeImmutable({
        artifactId: "artifact-1",
        contentType: "application/json",
        bytes,
        expectedSha256Digest: sha256Digest
      })
    ).rejects.toEqual(expect.objectContaining({ reason: "existing_object_integrity" }));
  });

  it("reads a pinned version only after validating metadata, length and plaintext digest", async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetObjectCommand) {
        return {
          Body: { transformToByteArray: async () => bytes },
          ContentType: "application/json",
          ContentLength: bytes.length,
          Metadata: {
            "finance-sha256": sha256Digest,
            "finance-content-type": "application/json"
          }
        };
      }
      throw new Error("unexpected command");
    });
    const storage = createS3FinancePrivateObjectStorage(config, { send });
    const locator = {
      privateObjectKey: "finance/artifacts/artifact-1.json",
      privateObjectVersion: "version-1",
      envelopeKeyVersion: config.kmsKeyArn
    } as const;

    await expect(storage.readImmutable(locator)).resolves.toEqual({
      bytes,
      sha256Digest,
      byteLength: bytes.length,
      contentType: "application/json"
    });
    expect((send.mock.calls[0]?.[0] as GetObjectCommand).input).toMatchObject({
      Bucket: config.bucket,
      Key: locator.privateObjectKey,
      VersionId: locator.privateObjectVersion
    });
  });

  it("rejects altered object bytes and sends a version-pinned delete only", async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetObjectCommand) {
        return {
          Body: { transformToByteArray: async () => Buffer.from("altered") },
          ContentType: "application/json",
          ContentLength: 7,
          Metadata: {
            "finance-sha256": sha256Digest,
            "finance-content-type": "application/json"
          }
        };
      }
      return {};
    });
    const storage = createS3FinancePrivateObjectStorage(config, { send });
    const locator = {
      privateObjectKey: "finance/artifacts/artifact-1.json",
      privateObjectVersion: "version-1",
      envelopeKeyVersion: config.kmsKeyArn
    } as const;

    await expect(storage.readImmutable(locator)).rejects.toBeInstanceOf(
      FinancePrivateObjectStorageError
    );
    await storage.deleteImmutable(locator);
    const deleteCommand = send.mock.calls[1]?.[0];
    expect(deleteCommand).toBeInstanceOf(DeleteObjectCommand);
    expect((deleteCommand as DeleteObjectCommand).input).toMatchObject({
      Bucket: config.bucket,
      Key: locator.privateObjectKey,
      VersionId: locator.privateObjectVersion
    });
  });
});

function digest(value: Uint8Array) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}` as const;
}
