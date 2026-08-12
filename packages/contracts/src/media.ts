import {
  astroDiaryMediaPurposeUploadLimits,
  astroDiaryMediaUploadPurposeValues,
  mediaImageMimeTypeValues,
  mediaMimeTypeValues,
  mediaPurposeUploadLimits,
  mediaPurposeValues,
  mediaUploadPurposeValues,
  mediaStatusValues,
  mediaVariantValues,
  mediaVisibilityValues
} from "@elevenhouse/validation/media";
import { nonEmptyStringSchema, z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const dateTimeSchema = z.string().datetime();
const uploadHeaderNameSchema = z.string().trim().min(1).max(100).toLowerCase();
const uploadHeaderValueSchema = z.string().trim().min(1).max(500);
const checksumSha256Schema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/);

export const mediaPurposeSchema = z.enum(mediaPurposeValues);
export type MediaPurpose = z.infer<typeof mediaPurposeSchema>;

export const mediaUploadPurposeSchema = z.enum(mediaUploadPurposeValues);
export type MediaUploadPurpose = z.infer<typeof mediaUploadPurposeSchema>;

export const astroDiaryMediaUploadPurposeSchema = z.enum(astroDiaryMediaUploadPurposeValues);
export type AstroDiaryMediaUploadPurpose = z.infer<typeof astroDiaryMediaUploadPurposeSchema>;

export const mediaStatusSchema = z.enum(mediaStatusValues);
export type MediaStatus = z.infer<typeof mediaStatusSchema>;

export const mediaVisibilitySchema = z.enum(mediaVisibilityValues);
export type MediaVisibility = z.infer<typeof mediaVisibilitySchema>;

export const mediaImageMimeTypeSchema = z.enum(mediaImageMimeTypeValues);
export type MediaImageMimeType = z.infer<typeof mediaImageMimeTypeSchema>;

export const mediaMimeTypeSchema = z.enum(mediaMimeTypeValues);
export type MediaMimeType = z.infer<typeof mediaMimeTypeSchema>;

export const mediaVariantSchema = z.enum(mediaVariantValues);
export type MediaVariant = z.infer<typeof mediaVariantSchema>;

export const createMediaUploadIntentRequestSchema = z
  .object({
    purpose: mediaUploadPurposeSchema,
    fileName: nonEmptyStringSchema.max(255),
    mimeType: mediaMimeTypeSchema,
    sizeBytes: z.number().int().positive()
  })
  .strict()
  .superRefine((value, ctx) => {
    const limit = mediaPurposeUploadLimits[value.purpose];

    if (!(limit.allowedMimeTypes as readonly string[]).includes(value.mimeType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mimeType"],
        message: "Unsupported media MIME type for purpose"
      });
    }

    if (value.sizeBytes > limit.maxSizeBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sizeBytes"],
        message: "Media file exceeds purpose upload limit"
      });
    }
  });
export type CreateMediaUploadIntentRequest = z.infer<typeof createMediaUploadIntentRequestSchema>;

export const createAstroDiaryMediaUploadIntentRequestSchema = z
  .object({
    purpose: astroDiaryMediaUploadPurposeSchema,
    fileName: nonEmptyStringSchema.max(255),
    mimeType: mediaMimeTypeSchema,
    sizeBytes: z.number().int().positive()
  })
  .strict()
  .superRefine((value, ctx) => {
    const limit = astroDiaryMediaPurposeUploadLimits[value.purpose];

    if (!(limit.allowedMimeTypes as readonly string[]).includes(value.mimeType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mimeType"],
        message: "Unsupported AstroDiary media MIME type for purpose"
      });
    }

    if (value.sizeBytes > limit.maxSizeBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sizeBytes"],
        message: "AstroDiary media file exceeds purpose upload limit"
      });
    }
  });
export type CreateAstroDiaryMediaUploadIntentRequest = z.infer<
  typeof createAstroDiaryMediaUploadIntentRequestSchema
>;

export const mediaUploadTargetSchema = z
  .object({
    method: z.literal("PUT"),
    url: z.string().url(),
    headers: z.record(uploadHeaderNameSchema, uploadHeaderValueSchema),
    expiresAt: dateTimeSchema
  })
  .strict();
export type MediaUploadTarget = z.infer<typeof mediaUploadTargetSchema>;

export const mediaUploadIntentResponseSchema = z
  .object({
    mediaId: uuidSchema,
    status: z.literal("uploading"),
    upload: mediaUploadTargetSchema
  })
  .strict();
export type MediaUploadIntentResponse = z.infer<typeof mediaUploadIntentResponseSchema>;

export const completeMediaUploadRequestSchema = z
  .object({
    checksumSha256: checksumSha256Schema.optional()
  })
  .strict();
export type CompleteMediaUploadRequest = z.infer<typeof completeMediaUploadRequestSchema>;

export const mediaVariantResponseSchema = z
  .object({
    variant: mediaVariantSchema,
    url: z.string().url(),
    mimeType: mediaImageMimeTypeSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    sizeBytes: z.number().int().positive()
  })
  .strict();
export type MediaVariantResponse = z.infer<typeof mediaVariantResponseSchema>;

export const mediaAssetResponseSchema = z
  .object({
    id: uuidSchema,
    ownerUserId: uuidSchema,
    purpose: mediaPurposeSchema,
    status: mediaStatusSchema,
    visibility: mediaVisibilitySchema,
    originalFileName: nonEmptyStringSchema.max(255),
    mimeType: mediaMimeTypeSchema,
    sizeBytes: z.number().int().positive(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    altText: z.string().trim().max(300).nullable(),
    url: z.string().url(),
    variants: z.array(mediaVariantResponseSchema),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema
  })
  .strict();
export type MediaAssetResponse = z.infer<typeof mediaAssetResponseSchema>;
