import { nonEmptyStringSchema, z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });

const nullableTrimmedStringSchema = z
  .union([
    z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : value)),
    z.null()
  ])
  .optional();

const requiredTrimmedStringSchema = nonEmptyStringSchema.max(500);

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

export const consultationLanguageSchema = astrologerProfileLocaleSchema;
export type ConsultationLanguage = z.infer<typeof consultationLanguageSchema>;

const consultationLanguagesSchema = z
  .array(consultationLanguageSchema)
  .min(1)
  .max(20)
  .superRefine((values, ctx) => {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Consultation languages must be unique"
      });
    }
  });

export const astrologerProfileResponseSchema = z
  .object({
    ownerUserId: uuidSchema,
    publicHandle: astrologerPublicHandleSchema,
    publicName: nonEmptyStringSchema.max(200),
    headline: z.string().trim().max(240).nullable(),
    bio: z.string().trim().max(4000).nullable(),
    timezone: requiredTrimmedStringSchema,
    locale: astrologerProfileLocaleSchema,
    avatarMediaId: z.string().trim().max(500).nullable(),
    coverMediaId: z.string().trim().max(500).nullable(),
    consultationLanguages: consultationLanguagesSchema,
    isPublicPageEnabled: z.boolean(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict();
export type AstrologerProfileResponse = z.infer<typeof astrologerProfileResponseSchema>;

export const getAstrologerProfileResponseSchema = z
  .object({
    profile: astrologerProfileResponseSchema.nullable()
  })
  .strict();
export type GetAstrologerProfileResponse = z.infer<typeof getAstrologerProfileResponseSchema>;

export const upsertAstrologerProfileRequestSchema = z
  .object({
    publicHandle: astrologerPublicHandleSchema,
    publicName: nonEmptyStringSchema.max(200),
    headline: nullableTrimmedStringSchema,
    bio: nullableTrimmedStringSchema,
    timezone: requiredTrimmedStringSchema,
    locale: astrologerProfileLocaleSchema,
    avatarMediaId: nullableTrimmedStringSchema,
    coverMediaId: nullableTrimmedStringSchema,
    consultationLanguages: consultationLanguagesSchema,
    isPublicPageEnabled: z.boolean()
  })
  .strict();
export type UpsertAstrologerProfileRequest = z.infer<
  typeof upsertAstrologerProfileRequestSchema
>;

export const updateAstrologerProfileRequestSchema = upsertAstrologerProfileRequestSchema
  .partial()
  .strict();
export type UpdateAstrologerProfileRequest = z.infer<
  typeof updateAstrologerProfileRequestSchema
>;
