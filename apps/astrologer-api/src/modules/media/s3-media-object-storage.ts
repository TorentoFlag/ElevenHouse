import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  ObjectStoragePort,
  PrivateObjectStoragePort,
  PresignedUploadInput,
  UploadedObjectMetadata
} from "@elevenhouse/domain";
import type { MediaPublicUrlResolver } from "./media-response.mapper";

export type S3MediaObjectStorageConfig = {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly privateBucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
  readonly publicBaseUrl: string;
  readonly uploadTtlSeconds: number;
  readonly downloadTtlSeconds: number;
};

export class S3MediaObjectStorage
  implements ObjectStoragePort, PrivateObjectStoragePort, MediaPublicUrlResolver
{
  private readonly client: S3Client;

  constructor(
    private readonly config: S3MediaObjectStorageConfig,
    client?: S3Client
  ) {
    this.client =
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
  }

  async createPresignedUpload(input: PresignedUploadInput) {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.storageKey,
      ContentType: input.mimeType,
      ContentLength: input.sizeBytes
    });

    return {
      bucket: this.config.bucket,
      method: "PUT" as const,
      url: await getSignedUrl(this.client, command, {
        expiresIn: this.config.uploadTtlSeconds
      }),
      headers: {
        "content-type": input.mimeType
      },
      expiresAt: new Date(Date.now() + this.config.uploadTtlSeconds * 1000).toISOString()
    };
  }

  async readUploadedObjectMetadata(input: {
    readonly storageBucket: string;
    readonly storageKey: string;
  }): Promise<UploadedObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: input.storageBucket,
          Key: input.storageKey
        })
      );

      return {
        sizeBytes: result.ContentLength ?? 0,
        mimeType: result.ContentType ?? "",
        checksumSha256: result.Metadata?.["checksum-sha256"] ?? null,
        width: readPositiveIntegerMetadata(result.Metadata?.width),
        height: readPositiveIntegerMetadata(result.Metadata?.height)
      };
    } catch (error) {
      if (readHttpStatus(error) === 404) {
        return null;
      }
      throw error;
    }
  }

  async createPresignedDownload(input: {
    readonly storageBucket: string;
    readonly storageKey: string;
    readonly fileName: string;
  }) {
    if (input.storageBucket !== this.config.privateBucket) {
      throw new Error("Private download requested from an unexpected storage bucket");
    }
    const expiresAt = new Date(Date.now() + this.config.downloadTtlSeconds * 1000).toISOString();
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: input.storageBucket,
        Key: input.storageKey,
        ResponseContentType: "application/pdf",
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(input.fileName)}`
      }),
      { expiresIn: this.config.downloadTtlSeconds }
    );
    return { url, expiresAt };
  }

  getPublicUrl(input: { readonly storageKey: string }): string {
    return `${this.config.publicBaseUrl}/${encodeStorageKey(input.storageKey)}`;
  }
}

function encodeStorageKey(storageKey: string): string {
  return storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function readPositiveIntegerMetadata(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function readHttpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) {
    return undefined;
  }
  const metadata = (error as { readonly $metadata?: { readonly httpStatusCode?: unknown } })
    .$metadata;
  return typeof metadata?.httpStatusCode === "number" ? metadata.httpStatusCode : undefined;
}
