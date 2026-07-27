import { HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { MessagingMediaIngestionStorage } from "./messaging-media-ingestion.types";

export type S3MessagingMediaObjectStorageConfig = {
  readonly endpoint: string;
  readonly region: string;
  readonly privateBucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
};

type S3Sender = {
  readonly send: (command: PutObjectCommand | HeadBucketCommand) => Promise<unknown>;
};

export function createS3MessagingMediaObjectStorage(
  config: S3MessagingMediaObjectStorageConfig,
  client?: S3Sender
): MessagingMediaIngestionStorage & { readonly checkReady: () => Promise<void> } {
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

  return {
    checkReady: async () => {
      await s3.send(new HeadBucketCommand({ Bucket: config.privateBucket }));
    },
    putPrivateObject: async (input) => {
      if (input.storageBucket !== config.privateBucket) {
        throw new Error("Messaging media requested for an unexpected storage bucket");
      }
      if (!input.storageKey.trim()) throw new Error("Messaging media storage key is required");
      if (input.body.byteLength === 0) throw new Error("Messaging media object cannot be empty");
      if (!/^[a-f0-9]{64}$/.test(input.checksumSha256)) {
        throw new Error("Messaging media checksum is invalid");
      }

      await s3.send(
        new PutObjectCommand({
          Bucket: input.storageBucket,
          Key: input.storageKey,
          Body: input.body,
          ContentType: input.mimeType,
          ContentLength: input.body.byteLength,
          ContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(input.storageKey.split("/").at(-1) ?? "voice")}`,
          Metadata: { "checksum-sha256": input.checksumSha256 }
        })
      );
    }
  };
}
