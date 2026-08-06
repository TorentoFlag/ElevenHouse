import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createFilesystemFinancePrivateObjectStorage } from "./filesystem-finance-private-object-storage";

const bytes = Buffer.from('{"provider":"arc-pay","event":"paid"}', "utf8");
const sha256Digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

describe("createFilesystemFinancePrivateObjectStorage", () => {
  it("persists an immutable, digest-pinned finance artifact and reads the same bytes", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "elevenhouse-finance-"));
    try {
      const storage = createFilesystemFinancePrivateObjectStorage({ rootDirectory });
      await expect(storage.checkReady()).resolves.toBeUndefined();

      const receipt = await storage.writeImmutable({
        artifactId: "arc-pay-webhook-1",
        contentType: "application/json",
        bytes,
        expectedSha256Digest: sha256Digest
      });

      expect(receipt).toEqual({
        privateObjectKey: "finance/artifacts/arc-pay-webhook-1.json",
        privateObjectVersion: sha256Digest,
        envelopeKeyVersion: "filesystem-v1",
        sha256Digest,
        byteLength: bytes.length,
        contentType: "application/json"
      });
      await expect(storage.readImmutable(receipt)).resolves.toEqual({
        bytes,
        sha256Digest,
        byteLength: bytes.length,
        contentType: "application/json"
      });
      await expect(readFile(join(rootDirectory, receipt.privateObjectKey))).resolves.toEqual(bytes);
    } finally {
      await rm(rootDirectory, { recursive: true, force: true });
    }
  });

  it("does not replace an existing artifact with different bytes", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "elevenhouse-finance-"));
    try {
      const storage = createFilesystemFinancePrivateObjectStorage({ rootDirectory });
      await storage.writeImmutable({
        artifactId: "arc-pay-webhook-1",
        contentType: "application/json",
        bytes,
        expectedSha256Digest: sha256Digest
      });

      await expect(
        storage.writeImmutable({
          artifactId: "arc-pay-webhook-1",
          contentType: "application/json",
          bytes: Buffer.from("different"),
          expectedSha256Digest: `sha256:${createHash("sha256").update("different").digest("hex")}` as const
        })
      ).rejects.toEqual(expect.objectContaining({ reason: "existing_object_integrity" }));
    } finally {
      await rm(rootDirectory, { recursive: true, force: true });
    }
  });
});
