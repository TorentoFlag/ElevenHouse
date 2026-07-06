export const mediaPurposeValues = [
  "product_cover",
  "profile_avatar",
  "profile_cover",
  "verification_identity_document",
  "verification_qualification_document"
] as const;
export type MediaPurposeValue = (typeof mediaPurposeValues)[number];

export const mediaStatusValues = [
  "uploading",
  "processing",
  "ready",
  "failed",
  "deleted"
] as const;
export type MediaStatusValue = (typeof mediaStatusValues)[number];

export const mediaVisibilityValues = ["public", "private"] as const;
export type MediaVisibilityValue = (typeof mediaVisibilityValues)[number];

export const mediaImageMimeTypeValues = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif"
] as const;
export type MediaImageMimeTypeValue = (typeof mediaImageMimeTypeValues)[number];

export const mediaDocumentMimeTypeValues = ["application/pdf"] as const;
export type MediaDocumentMimeTypeValue = (typeof mediaDocumentMimeTypeValues)[number];

export const mediaMimeTypeValues = [...mediaImageMimeTypeValues, ...mediaDocumentMimeTypeValues] as const;
export type MediaMimeTypeValue = (typeof mediaMimeTypeValues)[number];

export const mediaVariantValues = ["original", "preview", "card", "cover"] as const;
export type MediaVariantValue = (typeof mediaVariantValues)[number];

export const mediaPurposeUploadLimits = {
  product_cover: {
    maxSizeBytes: 15_000_000,
    allowedMimeTypes: mediaImageMimeTypeValues,
    visibility: "public"
  },
  profile_avatar: {
    maxSizeBytes: 8_000_000,
    allowedMimeTypes: mediaImageMimeTypeValues,
    visibility: "public"
  },
  profile_cover: {
    maxSizeBytes: 15_000_000,
    allowedMimeTypes: mediaImageMimeTypeValues,
    visibility: "public"
  },
  verification_identity_document: {
    maxSizeBytes: 20_000_000,
    allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
    visibility: "private"
  },
  verification_qualification_document: {
    maxSizeBytes: 20_000_000,
    allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
    visibility: "private"
  }
} satisfies Record<
  MediaPurposeValue,
  {
    readonly maxSizeBytes: number;
    readonly allowedMimeTypes: readonly MediaMimeTypeValue[];
    readonly visibility: MediaVisibilityValue;
  }
>;
