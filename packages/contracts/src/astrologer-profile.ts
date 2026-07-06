import { nonEmptyStringSchema, z } from "@elevenhouse/validation";
import { mediaAssetResponseSchema } from "./media";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });

function createNullableTrimmedStringSchema(maxLength: number) {
  return z
    .union([
      z
        .string()
        .trim()
        .max(maxLength)
        .transform((value) => (value.length === 0 ? null : value)),
      z.null()
    ])
    .optional();
}

const nullableTrimmedStringSchema = createNullableTrimmedStringSchema(500);
const nullableUuidSchema = z
  .union([z.string().trim().uuid(), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

const requiredTrimmedStringSchema = nonEmptyStringSchema.max(500);
const publicNameSchema = nonEmptyStringSchema.min(2).max(200);
const responseNullableStringSchema = z.string().trim().max(500).nullable();
const emptySocialLinks = {
  telegram: null,
  instagram: null,
  whatsapp: null,
  website: null
} as const;
const emptyOwnBirthData = {
  date: null,
  time: null,
  place: null,
  showOnPublicPage: false
} as const;

const uniqueTrimmedStringArraySchema = z
  .array(z.string().trim().min(1).max(120))
  .max(30)
  .superRefine((values, ctx) => {
    const normalizedValues = values.map((value) => value.toLocaleLowerCase());
    if (new Set(normalizedValues).size !== normalizedValues.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Values must be unique"
      });
    }
  });

export const astrologerProfileVisibilityStatusSchema = z.enum(["published", "paused", "draft"]);
export type AstrologerProfileVisibilityStatus = z.infer<
  typeof astrologerProfileVisibilityStatusSchema
>;

export const astrologerPublicHandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
export type AstrologerPublicHandle = z.infer<typeof astrologerPublicHandleSchema>;

export const astrologerProfileLocaleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(20)
  .regex(/^[a-z]{2}(?:-[a-z0-9]{2,8})*$/);
export type AstrologerProfileLocale = z.infer<typeof astrologerProfileLocaleSchema>;

export const consultationLanguageSchema = z.string().trim().min(1).max(80);
export type ConsultationLanguage = z.infer<typeof consultationLanguageSchema>;

const consultationLanguagesSchema = z
  .array(consultationLanguageSchema)
  .min(1)
  .max(20)
  .superRefine((values, ctx) => {
    const normalizedValues = values.map((value) => value.toLocaleLowerCase());
    if (new Set(normalizedValues).size !== normalizedValues.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Consultation languages must be unique"
      });
    }
  });

export const astrologerProfileSocialLinksSchema = z
  .object({
    telegram: nullableTrimmedStringSchema,
    instagram: nullableTrimmedStringSchema,
    whatsapp: nullableTrimmedStringSchema,
    website: nullableTrimmedStringSchema
  })
  .strict()
  .transform((value) => ({
    telegram: value.telegram ?? null,
    instagram: value.instagram ?? null,
    whatsapp: value.whatsapp ?? null,
    website: value.website ?? null
  }));
export type AstrologerProfileSocialLinks = z.infer<typeof astrologerProfileSocialLinksSchema>;

export const astrologerProfileOwnBirthDataSchema = z
  .object({
    date: z
      .union([
        z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/),
        z.literal(""),
        z.null()
      ])
      .optional()
      .transform((value) => (value ? value : null)),
    time: z
      .union([
        z
          .string()
          .trim()
          .regex(/^\d{2}:\d{2}$/),
        z.literal(""),
        z.null()
      ])
      .optional()
      .transform((value) => (value ? value : null)),
    place: nullableTrimmedStringSchema,
    showOnPublicPage: z.boolean().default(false)
  })
  .strict()
  .transform((value) => ({
    date: value.date ?? null,
    time: value.time ?? null,
    place: value.place ?? null,
    showOnPublicPage: value.showOnPublicPage
  }));
export type AstrologerProfileOwnBirthData = z.infer<typeof astrologerProfileOwnBirthDataSchema>;

export const astrologerProfileResponseSchema = z
  .object({
    ownerUserId: uuidSchema,
    publicHandle: astrologerPublicHandleSchema,
    publicName: publicNameSchema,
    headline: z.string().trim().max(240).nullable(),
    bio: z.string().trim().max(4000).nullable(),
    timezone: requiredTrimmedStringSchema,
    locale: astrologerProfileLocaleSchema,
    avatarMediaId: uuidSchema.nullable(),
    avatarMedia: mediaAssetResponseSchema.nullable(),
    coverMediaId: uuidSchema.nullable(),
    coverMedia: mediaAssetResponseSchema.nullable(),
    consultationLanguages: consultationLanguagesSchema,
    visibilityStatus: astrologerProfileVisibilityStatusSchema,
    professionalExperienceYears: z.number().int().min(0).max(100).nullable(),
    professionalSchool: responseNullableStringSchema,
    specializations: uniqueTrimmedStringArraySchema,
    methods: uniqueTrimmedStringArraySchema,
    socialLinks: astrologerProfileSocialLinksSchema,
    ownBirthData: astrologerProfileOwnBirthDataSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict();
export type AstrologerProfileResponse = z.infer<typeof astrologerProfileResponseSchema>;

export const astrologerProfileIntegrityIssueResponseSchema = z
  .object({
    code: z.enum(["avatar_media_unavailable", "cover_media_unavailable"]),
    severity: z.literal("warning"),
    field: z.enum(["avatarMediaId", "coverMediaId"]),
    mediaId: uuidSchema,
    message: z.string().min(1).max(240)
  })
  .strict();
export type AstrologerProfileIntegrityIssueResponse = z.infer<
  typeof astrologerProfileIntegrityIssueResponseSchema
>;

export const getAstrologerProfileResponseSchema = z
  .object({
    profile: astrologerProfileResponseSchema.nullable(),
    integrityIssues: z.array(astrologerProfileIntegrityIssueResponseSchema).max(10)
  })
  .strict();
export type GetAstrologerProfileResponse = z.infer<typeof getAstrologerProfileResponseSchema>;

const astrologerProfileRequestFieldsSchema = z
  .object({
    publicHandle: astrologerPublicHandleSchema,
    publicName: publicNameSchema,
    headline: createNullableTrimmedStringSchema(240),
    bio: createNullableTrimmedStringSchema(4000),
    timezone: requiredTrimmedStringSchema,
    locale: astrologerProfileLocaleSchema,
    avatarMediaId: nullableUuidSchema,
    coverMediaId: nullableUuidSchema,
    consultationLanguages: consultationLanguagesSchema,
    visibilityStatus: astrologerProfileVisibilityStatusSchema,
    professionalExperienceYears: z.number().int().min(0).max(100).nullable().optional(),
    professionalSchool: createNullableTrimmedStringSchema(500),
    specializations: uniqueTrimmedStringArraySchema.optional(),
    methods: uniqueTrimmedStringArraySchema.optional(),
    socialLinks: astrologerProfileSocialLinksSchema.optional(),
    ownBirthData: astrologerProfileOwnBirthDataSchema.optional()
  })
  .strict();

export const upsertAstrologerProfileRequestSchema = astrologerProfileRequestFieldsSchema.transform(
  (value) => {
    return {
      ...value,
      professionalExperienceYears: value.professionalExperienceYears ?? null,
      professionalSchool: value.professionalSchool ?? null,
      specializations: value.specializations ?? [],
      methods: value.methods ?? [],
      socialLinks: value.socialLinks ?? emptySocialLinks,
      ownBirthData: value.ownBirthData ?? emptyOwnBirthData
    };
  }
);
export type UpsertAstrologerProfileRequest = z.infer<typeof upsertAstrologerProfileRequestSchema>;
