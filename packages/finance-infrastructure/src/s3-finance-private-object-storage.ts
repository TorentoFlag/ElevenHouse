import { createHash } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import type {
  FinanceDigest,
  FinancePrivateObjectLocator,
  FinancePrivateObjectRead,
  FinancePrivateObjectStoragePort,
  FinancePrivateObjectWriteReceipt
} from "@elevenhouse/domain/finance-core";

export type S3FinancePrivateObjectStorageConfig = Readonly<{
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  /** Customer-managed KMS key ARN, not an alias. It is recorded with every immutable object. */
  kmsKeyArn: string;
}>;

type S3Command = PutObjectCommand | GetObjectCommand | DeleteObjectCommand | HeadBucketCommand;
type S3Sender = Readonly<{ send(command: S3Command): Promise<unknown> }>;

export type FinancePrivateObjectStorageRuntime = FinancePrivateObjectStoragePort &
  Readonly<{ checkReady(): Promise<void> }>;

export class FinancePrivateObjectStorageError extends Error {
  readonly code = "FINANCE_PRIVATE_OBJECT_STORAGE_ERROR" as const;

  constructor(
    readonly reason:
      | "invalid_input"
      | "write_unversioned"
      | "read_integrity"
      | "existing_object_integrity"
  ) {
    super("Finance private object storage operation failed");
    this.name = "FinancePrivateObjectStorageError";
  }
}

/**
 * Stores finance artifacts only in a versioned private bucket with SSE-KMS.  There is no
 * unencrypted/local fallback: production credentials need both object and KMS permissions.
 */
export function createS3FinancePrivateObjectStorage(
  config: S3FinancePrivateObjectStorageConfig,
  client?: S3Sender
): FinancePrivateObjectStorageRuntime {
  assertConfig(config);
  const s3: S3Sender =
    client ??
    new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });

  return Object.freeze({
    checkReady: async () => {
      await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
    },
    writeImmutable: async (input) => {
      const normalized = normalizeWrite(input);
      const privateObjectKey = `finance/artifacts/${normalized.artifactId}.json`;
      let result: { readonly VersionId?: unknown };
      try {
        result = (await s3.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: privateObjectKey,
            Body: normalized.bytes,
            ContentType: normalized.contentType,
            ContentLength: normalized.bytes.length,
            ChecksumSHA256: normalized.sha256Base64,
            IfNoneMatch: "*",
            ServerSideEncryption: "aws:kms",
            SSEKMSKeyId: config.kmsKeyArn,
            Metadata: {
              "finance-sha256": normalized.expectedSha256Digest,
              "finance-content-type": normalized.contentType
            }
          })
        )) as { readonly VersionId?: unknown };
      } catch (error) {
        if (!isPreconditionFailed(error)) throw error;
        return recoverExistingImmutableObject({
          s3,
          bucket: config.bucket,
          privateObjectKey,
          envelopeKeyVersion: config.kmsKeyArn,
          expected: normalized
        });
      }
      if (typeof result.VersionId !== "string" || !result.VersionId.trim()) {
        throw new FinancePrivateObjectStorageError("write_unversioned");
      }
      return Object.freeze({
        privateObjectKey,
        privateObjectVersion: result.VersionId,
        envelopeKeyVersion: config.kmsKeyArn,
        sha256Digest: normalized.expectedSha256Digest,
        byteLength: normalized.bytes.length,
        contentType: normalized.contentType
      });
    },
    readImmutable: async (input) => {
      const locator = normalizeLocator(input, config.kmsKeyArn);
      const result = (await s3.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: locator.privateObjectKey,
          VersionId: locator.privateObjectVersion
        })
      )) as {
        readonly Body?: unknown;
        readonly ContentType?: unknown;
        readonly ContentLength?: unknown;
        readonly Metadata?: Readonly<Record<string, string | undefined>>;
      };
      const bytes = await bodyBytes(result.Body);
      const contentType = result.ContentType;
      const expectedDigest = result.Metadata?.["finance-sha256"];
      const expectedContentType = result.Metadata?.["finance-content-type"];
      const actualDigest = digest(bytes);
      if (
        typeof contentType !== "string" ||
        !contentType.trim() ||
        typeof expectedDigest !== "string" ||
        !digestPattern.test(expectedDigest) ||
        typeof expectedContentType !== "string" ||
        expectedContentType !== contentType ||
        actualDigest !== expectedDigest ||
        (typeof result.ContentLength === "number" && result.ContentLength !== bytes.length)
      ) {
        throw new FinancePrivateObjectStorageError("read_integrity");
      }
      return Object.freeze({
        bytes,
        sha256Digest: actualDigest,
        byteLength: bytes.length,
        contentType
      }) as FinancePrivateObjectRead;
    },
    deleteImmutable: async (input) => {
      const locator = normalizeLocator(input, config.kmsKeyArn);
      await s3.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: locator.privateObjectKey,
          VersionId: locator.privateObjectVersion
        })
      );
    }
  });
}

async function recoverExistingImmutableObject(
  input: Readonly<{
    s3: S3Sender;
    bucket: string;
    privateObjectKey: string;
    envelopeKeyVersion: string;
    expected: ReturnType<typeof normalizeWrite>;
  }>
): Promise<FinancePrivateObjectWriteReceipt> {
  const result = (await input.s3.send(
    new GetObjectCommand({ Bucket: input.bucket, Key: input.privateObjectKey })
  )) as {
    readonly Body?: unknown;
    readonly VersionId?: unknown;
    readonly ContentType?: unknown;
    readonly ContentLength?: unknown;
    readonly Metadata?: Readonly<Record<string, string | undefined>>;
  };
  const bytes = await bodyBytes(result.Body);
  if (
    typeof result.VersionId !== "string" ||
    !result.VersionId.trim() ||
    result.ContentType !== input.expected.contentType ||
    result.ContentLength !== input.expected.bytes.length ||
    result.Metadata?.["finance-sha256"] !== input.expected.expectedSha256Digest ||
    result.Metadata?.["finance-content-type"] !== input.expected.contentType ||
    bytes.length !== input.expected.bytes.length ||
    digest(bytes) !== input.expected.expectedSha256Digest
  ) {
    throw new FinancePrivateObjectStorageError("existing_object_integrity");
  }
  return Object.freeze({
    privateObjectKey: input.privateObjectKey,
    privateObjectVersion: result.VersionId,
    envelopeKeyVersion: input.envelopeKeyVersion,
    sha256Digest: input.expected.expectedSha256Digest,
    byteLength: input.expected.bytes.length,
    contentType: input.expected.contentType
  });
}

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const artifactIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const contentTypePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

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
  return Object.freeze({
    artifactId: input.artifactId,
    contentType: input.contentType,
    bytes: input.bytes,
    expectedSha256Digest: input.expectedSha256Digest,
    sha256Base64: Buffer.from(input.expectedSha256Digest.slice("sha256:".length), "hex").toString(
      "base64"
    )
  });
}

function normalizeLocator(
  input: FinancePrivateObjectLocator,
  expectedKmsKeyArn: string
): FinancePrivateObjectLocator {
  if (
    !input ||
    !/^finance\/artifacts\/[A-Za-z0-9][A-Za-z0-9._:-]{0,159}\.json$/.test(input.privateObjectKey) ||
    !input.privateObjectVersion.trim() ||
    input.envelopeKeyVersion !== expectedKmsKeyArn
  ) {
    throw new FinancePrivateObjectStorageError("invalid_input");
  }
  return input;
}

function isPreconditionFailed(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as Readonly<{ $metadata?: Readonly<{ httpStatusCode?: unknown }> }>;
  return candidate.$metadata?.httpStatusCode === 412;
}

function assertConfig(config: S3FinancePrivateObjectStorageConfig): void {
  try {
    if (new URL(config.endpoint).protocol !== "https:") throw new Error();
  } catch {
    throw new FinancePrivateObjectStorageError("invalid_input");
  }
  if (
    !config.region.trim() ||
    !config.bucket.trim() ||
    !config.accessKeyId.trim() ||
    !config.secretAccessKey.trim() ||
    !/^arn:aws[a-z-]*:kms:[a-z0-9-]+:\d{12}:key\/[0-9a-f-]{36}$/i.test(config.kmsKeyArn)
  ) {
    throw new FinancePrivateObjectStorageError("invalid_input");
  }
}

async function bodyBytes(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (
    typeof body === "object" &&
    body !== null &&
    "transformToByteArray" in body &&
    typeof body.transformToByteArray === "function"
  ) {
    const bytes = await body.transformToByteArray();
    if (bytes instanceof Uint8Array) return bytes;
  }
  throw new FinancePrivateObjectStorageError("read_integrity");
}

function digest(bytes: Uint8Array): FinanceDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}` as FinanceDigest;
}
