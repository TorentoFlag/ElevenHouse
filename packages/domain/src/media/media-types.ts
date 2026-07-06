import type {
  MediaImageMimeTypeValue,
  MediaMimeTypeValue,
  MediaPurposeValue,
  MediaStatusValue,
  MediaVariantValue,
  MediaVisibilityValue
} from "@elevenhouse/validation/media";

export type MediaPurpose = MediaPurposeValue;
export type MediaStatus = MediaStatusValue;
export type MediaVisibility = MediaVisibilityValue;
export type MediaImageMimeType = MediaImageMimeTypeValue;
export type MediaMimeType = MediaMimeTypeValue;
export type MediaVariantName = MediaVariantValue;

export type MediaVariant = {
  readonly variant: MediaVariantName;
  readonly storageBucket: string;
  readonly storageKey: string;
  readonly mimeType: MediaImageMimeType;
  readonly width: number;
  readonly height: number;
  readonly sizeBytes: number;
  readonly createdAt: string;
};

export type MediaAsset = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly purpose: MediaPurpose;
  readonly status: MediaStatus;
  readonly visibility: MediaVisibility;
  readonly storageBucket: string;
  readonly storageKey: string;
  readonly originalFileName: string;
  readonly mimeType: MediaMimeType;
  readonly sizeBytes: number;
  readonly checksumSha256: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly altText: string | null;
  readonly failureReason: string | null;
  readonly variants: readonly MediaVariant[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateMediaUploadIntentInput = {
  readonly purpose: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
};

export type CompleteMediaUploadInput = {
  readonly checksumSha256?: string;
};

export type MediaUploadTarget = {
  readonly method: "PUT";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: string;
};

export type MediaUploadIntent = {
  readonly mediaId: string;
  readonly status: "uploading";
  readonly upload: MediaUploadTarget;
};

export type UploadedObjectMetadata = {
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly checksumSha256: string | null;
  readonly width: number | null;
  readonly height: number | null;
};
