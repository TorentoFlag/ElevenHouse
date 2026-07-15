import {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

export type CalculationPdfObjectStorage = {
  readonly checkReady: () => Promise<void>;
  readonly putPdf: (input: {
    readonly storageBucket: string;
    readonly storageKey: string;
    readonly originalFileName: string;
    readonly bytes: Buffer;
    readonly checksumSha256: string;
  }) => Promise<void>;
  readonly deletePdf: (input: {
    readonly storageBucket: string;
    readonly storageKey: string;
  }) => Promise<void>;
};

type S3Sender = {
  readonly send: (
    command: PutObjectCommand | DeleteObjectCommand | HeadBucketCommand
  ) => Promise<unknown>;
};

export function createS3CalculationPdfObjectStorage(
  config: {
    readonly endpoint: string;
    readonly region: string;
    readonly privateBucket: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly forcePathStyle: boolean;
  },
  client?: S3Sender
): CalculationPdfObjectStorage {
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

  function assertTarget(storageBucket: string, storageKey: string): void {
    if (storageBucket !== config.privateBucket) {
      throw new Error("Calculation PDF requested for an unexpected storage bucket");
    }
    if (!storageKey.trim()) throw new Error("Calculation PDF storage key is required");
  }

  return {
    checkReady: async () => {
      await s3.send(new HeadBucketCommand({ Bucket: config.privateBucket }));
    },
    putPdf: async (input) => {
      assertTarget(input.storageBucket, input.storageKey);
      if (input.bytes.length === 0) throw new Error("Calculation PDF cannot be empty");
      if (!/^[a-f0-9]{64}$/.test(input.checksumSha256)) {
        throw new Error("Calculation PDF checksum is invalid");
      }
      await s3.send(
        new PutObjectCommand({
          Bucket: input.storageBucket,
          Key: input.storageKey,
          Body: input.bytes,
          ContentType: "application/pdf",
          ContentLength: input.bytes.length,
          ContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(input.originalFileName)}`,
          Metadata: { "checksum-sha256": input.checksumSha256 }
        })
      );
    },
    deletePdf: async (input) => {
      assertTarget(input.storageBucket, input.storageKey);
      await s3.send(
        new DeleteObjectCommand({ Bucket: input.storageBucket, Key: input.storageKey })
      );
    }
  };
}
