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

export type PrivateObjectStoragePort = {
  readonly createPresignedDownload: (input: {
    readonly storageBucket: string;
    readonly storageKey: string;
    readonly fileName: string;
  }) => Promise<{
    readonly url: string;
    readonly expiresAt: string;
  }>;
};
