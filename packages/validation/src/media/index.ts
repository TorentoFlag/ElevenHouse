export const mediaPurposeValues = ["product_cover", "profile_avatar", "profile_cover"] as const;
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
  }
} satisfies Record<
  MediaPurposeValue,
  {
    readonly maxSizeBytes: number;
    readonly allowedMimeTypes: readonly MediaImageMimeTypeValue[];
    readonly visibility: MediaVisibilityValue;
  }
>;
