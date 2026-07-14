import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type MatrixPdfObjectStorage = {
  readonly putPdf: (input: {
    readonly storageBucket: string;
    readonly storageKey: string;
    readonly originalFileName: string;
    readonly bytes: Buffer;
    readonly checksumSha256: string;
  }) => Promise<void>;
};

type S3Sender = { readonly send: (command: PutObjectCommand) => Promise<unknown> };

export function createS3MatrixPdfObjectStorage(
  config: {
    readonly endpoint: string;
    readonly region: string;
    readonly privateBucket: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly forcePathStyle: boolean;
  },
  client?: S3Sender
): MatrixPdfObjectStorage {
  const s3 =
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
    putPdf: async (input) => {
      if (input.storageBucket !== config.privateBucket) {
        throw new Error("Matrix PDF upload requested for an unexpected storage bucket");
      }
      if (input.bytes.length === 0) throw new Error("Matrix PDF cannot be empty");
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
    }
  };
}
