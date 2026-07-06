import type { MediaMimeType, UploadedObjectMetadata } from "./media-types";

export type PresignedUploadInput = {
  readonly storageKey: string;
  readonly mimeType: MediaMimeType;
  readonly sizeBytes: number;
};

export type PresignedUpload = {
  readonly bucket: string;
  readonly method: "PUT";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: string;
};

export type ObjectStoragePort = {
  readonly createPresignedUpload: (input: PresignedUploadInput) => Promise<PresignedUpload>;
  readonly readUploadedObjectMetadata: (input: {
    readonly storageBucket: string;
    readonly storageKey: string;
  }) => Promise<UploadedObjectMetadata | null>;
};
