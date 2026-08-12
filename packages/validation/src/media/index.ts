export const mediaPurposeValues = [
  "product_cover",
  "profile_avatar",
  "profile_cover",
  "verification_identity_document",
  "verification_qualification_document",
  "calculation_report_pdf",
  "messaging_attachment",
  "astro_diary_attachment",
  "astro_diary_voice",
  "astro_diary_export_pdf"
] as const;
export type MediaPurposeValue = (typeof mediaPurposeValues)[number];

export const mediaUploadPurposeValues = [
  "product_cover",
  "profile_avatar",
  "profile_cover",
  "verification_identity_document",
  "verification_qualification_document"
] as const;
export type MediaUploadPurposeValue = (typeof mediaUploadPurposeValues)[number];

export const astroDiaryMediaUploadPurposeValues = [
  "astro_diary_attachment",
  "astro_diary_voice"
] as const;
export type AstroDiaryMediaUploadPurposeValue = (typeof astroDiaryMediaUploadPurposeValues)[number];

export const mediaStoragePurposeValues = [
  "calculation_report_pdf",
  "messaging_attachment",
  "astro_diary_export_pdf"
] as const;
export type MediaStoragePurposeValue = (typeof mediaStoragePurposeValues)[number];

export const mediaStatusValues = ["uploading", "processing", "ready", "failed", "deleted"] as const;
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

export const mediaAudioMimeTypeValues = ["audio/ogg", "audio/mpeg", "audio/mp4"] as const;
export type MediaAudioMimeTypeValue = (typeof mediaAudioMimeTypeValues)[number];

export const mediaVideoMimeTypeValues = ["video/mp4"] as const;
export type MediaVideoMimeTypeValue = (typeof mediaVideoMimeTypeValues)[number];

export const mediaMimeTypeValues = [
  ...mediaImageMimeTypeValues,
  ...mediaDocumentMimeTypeValues,
  ...mediaAudioMimeTypeValues,
  ...mediaVideoMimeTypeValues
] as const;
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
  MediaUploadPurposeValue,
  {
    readonly maxSizeBytes: number;
    readonly allowedMimeTypes: readonly MediaMimeTypeValue[];
    readonly visibility: MediaVisibilityValue;
  }
>;

export const astroDiaryMediaPurposeUploadLimits = {
  astro_diary_attachment: {
    maxSizeBytes: 20 * 1024 * 1024,
    allowedMimeTypes: [...mediaImageMimeTypeValues, ...mediaDocumentMimeTypeValues],
    visibility: "private"
  },
  astro_diary_voice: {
    maxSizeBytes: 20 * 1024 * 1024,
    allowedMimeTypes: mediaAudioMimeTypeValues,
    visibility: "private"
  }
} satisfies Record<
  AstroDiaryMediaUploadPurposeValue,
  {
    readonly maxSizeBytes: number;
    readonly allowedMimeTypes: readonly MediaMimeTypeValue[];
    readonly visibility: "private";
  }
>;

export const mediaPurposeStorageLimits = {
  calculation_report_pdf: {
    maxSizeBytes: 20_000_000,
    allowedMimeTypes: mediaDocumentMimeTypeValues,
    visibility: "private"
  },
  messaging_attachment: {
    maxSizeBytes: 20_000_000,
    allowedMimeTypes: [
      ...mediaAudioMimeTypeValues,
      ...mediaImageMimeTypeValues,
      ...mediaVideoMimeTypeValues
    ],
    visibility: "private"
  },
  astro_diary_export_pdf: {
    maxSizeBytes: 20 * 1024 * 1024,
    allowedMimeTypes: mediaDocumentMimeTypeValues,
    visibility: "private"
  }
} satisfies Record<
  MediaStoragePurposeValue,
  {
    readonly maxSizeBytes: number;
    readonly allowedMimeTypes: readonly MediaMimeTypeValue[];
    readonly visibility: MediaVisibilityValue;
  }
>;
