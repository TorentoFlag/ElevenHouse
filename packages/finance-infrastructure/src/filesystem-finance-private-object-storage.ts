import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  FinancePrivateObjectLocator,
  FinancePrivateObjectRead,
  FinancePrivateObjectStoragePort,
  FinancePrivateObjectWriteReceipt
} from "@elevenhouse/domain/finance-core";

import {
  FinancePrivateObjectStorageError,
  type FinancePrivateObjectStorageRuntime
} from "./s3-finance-private-object-storage";

export type FilesystemFinancePrivateObjectStorageConfig = Readonly<{
  rootDirectory: string;
}>;

const envelopeKeyVersion = "filesystem-v1";
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const artifactIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const contentTypePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

/**
 * The current direct-provider artifact store. It preserves the immutable locator and digest
 * contract used by finance processing, while keeping the raw ArcPay exchange on the local disk.
 */
export function createFilesystemFinancePrivateObjectStorage(
  config: FilesystemFinancePrivateObjectStorageConfig
): FinancePrivateObjectStorageRuntime {
  const rootDirectory = config.rootDirectory.trim();
  if (!rootDirectory) throw new FinancePrivateObjectStorageError("invalid_input");

  return Object.freeze({
    checkReady: async () => {
      await mkdir(join(rootDirectory, "finance", "artifacts"), { recursive: true });
    },
    writeImmutable: async (input) => {
      const normalized = normalizeWrite(input);
      const privateObjectKey = `finance/artifacts/${normalized.artifactId}.json`;
      const targetPath = pathFor(rootDirectory, privateObjectKey);
      const metadataPath = `${targetPath}.meta.json`;
      await mkdir(dirname(targetPath), { recursive: true });

      const metadata = JSON.stringify({
        sha256Digest: normalized.expectedSha256Digest,
        contentType: normalized.contentType,
        byteLength: normalized.bytes.length
      });
      try {
        await writeExclusive(targetPath, normalized.bytes);
        try {
          await writeExclusive(metadataPath, Buffer.from(metadata, "utf8"));
        } catch (error) {
          await rm(targetPath, { force: true });
          throw error;
        }
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        await assertExistingObject({ targetPath, metadataPath, expected: normalized });
      }

      return receipt(privateObjectKey, normalized);
    },
    readImmutable: async (input) => {
      const locator = normalizeLocator(input);
      const targetPath = pathFor(rootDirectory, locator.privateObjectKey);
      const metadataPath = `${targetPath}.meta.json`;
      const [bytes, metadata] = await Promise.all([readFile(targetPath), readMetadata(metadataPath)]);
      const actualDigest = digest(bytes);
      if (
        actualDigest !== metadata.sha256Digest ||
        bytes.length !== metadata.byteLength ||
        !contentTypePattern.test(metadata.contentType) ||
        locator.privateObjectVersion !== actualDigest
      ) {
        throw new FinancePrivateObjectStorageError("read_integrity");
      }
      return Object.freeze({
        bytes,
        sha256Digest: actualDigest,
        byteLength: bytes.length,
        contentType: metadata.contentType
      }) as FinancePrivateObjectRead;
    },
    deleteImmutable: async (input) => {
      const locator = normalizeLocator(input);
      const targetPath = pathFor(rootDirectory, locator.privateObjectKey);
      const read = await readFile(targetPath);
      if (digest(read) !== locator.privateObjectVersion) {
        throw new FinancePrivateObjectStorageError("read_integrity");
      }
      await Promise.all([rm(targetPath, { force: true }), rm(`${targetPath}.meta.json`, { force: true })]);
    }
  });
}

function normalizeWrite(input: Parameters<FinancePrivateObjectStoragePort["writeImmutable"]>[0]) {
  if (
    !input ||
    !artifactIdPattern.test(input.artifactId) ||
    !contentTypePattern.test(input.contentType) ||
    !(input.bytes instanceof Uint8Array) ||
    input.bytes.length < 1 ||
    !digestPattern.test(input.expectedSha256Digest) ||
    digest(input.bytes) !== input.expectedSha256Digest
  ) {
    throw new FinancePrivateObjectStorageError("invalid_input");
  }
  return Object.freeze(input);
}

function normalizeLocator(input: FinancePrivateObjectLocator): FinancePrivateObjectLocator {
  if (
    !input ||
    !/^finance\/artifacts\/[A-Za-z0-9][A-Za-z0-9._:-]{0,159}\.json$/.test(input.privateObjectKey) ||
    !digestPattern.test(input.privateObjectVersion) ||
    input.envelopeKeyVersion !== envelopeKeyVersion
  ) {
    throw new FinancePrivateObjectStorageError("invalid_input");
  }
  return input;
}

function pathFor(rootDirectory: string, privateObjectKey: string): string {
  return join(rootDirectory, privateObjectKey);
}

function receipt(
  privateObjectKey: string,
  normalized: ReturnType<typeof normalizeWrite>
): FinancePrivateObjectWriteReceipt {
  return Object.freeze({
    privateObjectKey,
    privateObjectVersion: normalized.expectedSha256Digest,
    envelopeKeyVersion,
    sha256Digest: normalized.expectedSha256Digest,
    byteLength: normalized.bytes.length,
    contentType: normalized.contentType
  });
}

async function assertExistingObject(input: Readonly<{
  targetPath: string;
  metadataPath: string;
  expected: ReturnType<typeof normalizeWrite>;
}>): Promise<void> {
  let bytes: Buffer;
  let metadata: Awaited<ReturnType<typeof readMetadata>>;
  try {
    [bytes, metadata] = await Promise.all([readFile(input.targetPath), readMetadata(input.metadataPath)]);
  } catch {
    throw new FinancePrivateObjectStorageError("existing_object_integrity");
  }
  if (
    digest(bytes) !== input.expected.expectedSha256Digest ||
    bytes.length !== input.expected.bytes.length ||
    metadata.sha256Digest !== input.expected.expectedSha256Digest ||
    metadata.contentType !== input.expected.contentType ||
    metadata.byteLength !== input.expected.bytes.length
  ) {
    throw new FinancePrivateObjectStorageError("existing_object_integrity");
  }
}

async function writeExclusive(path: string, bytes: Uint8Array): Promise<void> {
  await writeFile(path, bytes, { flag: "wx" });
}

async function readMetadata(path: string): Promise<Readonly<{
  sha256Digest: string;
  contentType: string;
  byteLength: number;
}>> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !digestPattern.test((parsed as { sha256Digest?: unknown }).sha256Digest as string) ||
    typeof (parsed as { contentType?: unknown }).contentType !== "string" ||
    !Number.isSafeInteger((parsed as { byteLength?: unknown }).byteLength) ||
    (parsed as { byteLength: number }).byteLength < 1
  ) {
    throw new FinancePrivateObjectStorageError("read_integrity");
  }
  return parsed as { sha256Digest: string; contentType: string; byteLength: number };
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "EEXIST";
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
