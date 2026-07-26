import { ianaTimeZoneSchema, nonEmptyStringSchema, z } from "@elevenhouse/validation";
import { astrologerPublicHandleSchema } from "./astrologer-profile";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime();
const nullableResponseStringSchema = z.string().trim().max(500).nullable();

const birthDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Invalid calendar date");

const birthTimeSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}$/)
  .refine((value) => {
    const [hoursPart, minutesPart] = value.split(":");
    const hours = Number(hoursPart);
    const minutes = Number(minutesPart);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }, "Invalid time");

const nullableTrimmedStringRequestSchema = z
  .union([
    z
      .string()
      .trim()
      .max(500)
      .transform((value) => (value.length === 0 ? null : value)),
    z.null()
  ])
  .optional()
  .transform((value) => value ?? null);

const nullableBirthDateRequestSchema = z
  .union([birthDateSchema, z.literal("").transform(() => null), z.null()])
  .optional()
  .transform((value) => value ?? null);

const nullableBirthTimeRequestSchema = z
  .union([birthTimeSchema, z.literal("").transform(() => null), z.null()])
  .optional()
  .transform((value) => value ?? null);

const nullableCountryCodeRequestSchema = z
  .union([
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/),
    z.literal("").transform(() => null),
    z.null()
  ])
  .optional()
  .transform((value) => value ?? null);

const nullableIanaTimeZoneRequestSchema = z
  .union([ianaTimeZoneSchema, z.literal("").transform(() => null), z.null(), z.undefined()])
  .transform((value) => value ?? null);

const nullableBirthTimeDstOccurrenceRequestSchema = z
  .enum(["first", "second"])
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const clientBirthTimePrecisionSchema = z.enum(["exact", "approximate", "unknown"]);
export type ClientBirthTimePrecision = z.infer<typeof clientBirthTimePrecisionSchema>;

export const clientBirthDataSourceSchema = z.enum([
  "client_profile",
  "booking",
  "import",
  "manual"
]);
export type ClientBirthDataSource = z.infer<typeof clientBirthDataSourceSchema>;

export const clientRelationshipStatusSchema = z.enum(["active", "archived", "blocked"]);
export type ClientRelationshipStatus = z.infer<typeof clientRelationshipStatusSchema>;

export const createClientJoinIntentRequestSchema = z
  .object({
    publicHandle: astrologerPublicHandleSchema
  })
  .strict();
export type CreateClientJoinIntentRequest = z.infer<typeof createClientJoinIntentRequestSchema>;

export const clientJoinIntentTokenSchema = z.string().trim().min(16).max(256);
export type ClientJoinIntentToken = z.infer<typeof clientJoinIntentTokenSchema>;

export const createClientJoinIntentResponseSchema = z
  .object({
    token: clientJoinIntentTokenSchema,
    astrologer: z
      .object({
        userId: uuidSchema,
        publicHandle: astrologerPublicHandleSchema,
        publicName: nonEmptyStringSchema.min(2).max(200)
      })
      .strict(),
    expiresAt: timestampSchema
  })
  .strict();
export type CreateClientJoinIntentResponse = z.infer<typeof createClientJoinIntentResponseSchema>;

export const clientBirthDataUpsertRequestSchema = z
  .object({
    label: nullableTrimmedStringRequestSchema,
    birthDate: nullableBirthDateRequestSchema,
    birthTime: nullableBirthTimeRequestSchema,
    birthTimePrecision: clientBirthTimePrecisionSchema.optional().default("unknown"),
    birthPlaceText: nullableTrimmedStringRequestSchema,
    birthCountryCode: nullableCountryCodeRequestSchema,
    birthCity: nullableTrimmedStringRequestSchema,
    birthRegion: nullableTrimmedStringRequestSchema,
    birthTimezone: nullableIanaTimeZoneRequestSchema,
    birthTimeDstOccurrence: nullableBirthTimeDstOccurrenceRequestSchema,
    birthLatitude: z
      .number()
      .min(-90)
      .max(90)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    birthLongitude: z
      .number()
      .min(-180)
      .max(180)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    isPrimary: z.boolean().optional().default(false)
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.birthTimePrecision === "unknown" && value.birthTime !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthTime"],
        message: "Birth time must be empty when precision is unknown"
      });
    }
  });
export type ClientBirthDataUpsertRequest = z.infer<typeof clientBirthDataUpsertRequestSchema>;

export const clientBirthDataResponseSchema = z
  .object({
    id: uuidSchema,
    clientUserId: uuidSchema,
    label: nullableResponseStringSchema,
    birthDate: birthDateSchema.nullable(),
    birthTime: birthTimeSchema.nullable(),
    birthTimePrecision: clientBirthTimePrecisionSchema,
    birthPlaceText: nullableResponseStringSchema,
    birthCountryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    birthCity: nullableResponseStringSchema,
    birthRegion: nullableResponseStringSchema,
    birthTimezone: ianaTimeZoneSchema.nullable(),
    birthTimeDstOccurrence: z
      .enum(["first", "second"])
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    birthLatitude: z.number().min(-90).max(90).nullable(),
    birthLongitude: z.number().min(-180).max(180).nullable(),
    source: clientBirthDataSourceSchema,
    isPrimary: z.boolean(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict();
export type ClientBirthDataResponse = z.infer<typeof clientBirthDataResponseSchema>;

export const clientBirthDataListResponseSchema = z
  .object({
    profiles: z.array(clientBirthDataResponseSchema)
  })
  .strict()
  .superRefine((value, context) => {
    const primaryCount = value.profiles.filter((profile) => profile.isPrimary).length;
    if (primaryCount > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["profiles"],
        message: "Client birth profile list cannot contain more than one primary profile"
      });
    }
  });
export type ClientBirthDataListResponse = z.infer<typeof clientBirthDataListResponseSchema>;

const relatedAstrologerResponseItemSchema = z
  .object({
    astrologerUserId: uuidSchema,
    publicHandle: astrologerPublicHandleSchema,
    publicName: nonEmptyStringSchema.min(2).max(200),
    relationshipStatus: clientRelationshipStatusSchema,
    firstLinkedAt: timestampSchema,
    lastLinkedAt: timestampSchema
  })
  .strict();

export const relatedAstrologerListResponseSchema = z
  .object({
    astrologers: z.array(relatedAstrologerResponseItemSchema)
  })
  .strict();
export type RelatedAstrologerListResponse = z.infer<typeof relatedAstrologerListResponseSchema>;

export const clientCabinetOverviewResponseSchema = z
  .object({
    astrologers: z.array(relatedAstrologerResponseItemSchema),
    birthProfiles: z.array(clientBirthDataResponseSchema),
    summary: z
      .object({
        directLinkOnly: z.literal(true),
        upcomingBookingCount: z.number().int().min(0),
        availableMaterialCount: z.number().int().min(0),
        unreadNotificationCount: z.number().int().min(0),
        activeSubscriptionCount: z.number().int().min(0)
      })
      .strict()
  })
  .strict()
  .superRefine((value, context) => {
    const primaryCount = value.birthProfiles.filter((profile) => profile.isPrimary).length;
    if (primaryCount > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthProfiles"],
        message: "Client cabinet overview cannot contain more than one primary birth profile"
      });
    }
  });
export type ClientCabinetOverviewResponse = z.infer<typeof clientCabinetOverviewResponseSchema>;

export const astrologerClientResponseItemSchema = z
  .object({
    clientUserId: uuidSchema,
    displayName: z.string().trim().min(1).max(200).nullable(),
    relationshipStatus: clientRelationshipStatusSchema,
    firstLinkedAt: timestampSchema,
    lastLinkedAt: timestampSchema,
    birthData: clientBirthDataResponseSchema.nullable()
  })
  .strict();
export type AstrologerClientResponseItem = z.infer<typeof astrologerClientResponseItemSchema>;

export const astrologerClientListQuerySchema = z
  .object({
    query: z.string().trim().max(100).optional().default(""),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    offset: z.coerce.number().int().min(0).optional().default(0)
  })
  .strict();
export type AstrologerClientListQuery = z.infer<typeof astrologerClientListQuerySchema>;

export const astrologerClientParamsSchema = z
  .object({
    clientUserId: uuidSchema
  })
  .strict();
export type AstrologerClientParams = z.infer<typeof astrologerClientParamsSchema>;

export const astrologerClientListResponseSchema = z
  .object({
    clients: z.array(astrologerClientResponseItemSchema),
    total: z.number().int().min(0)
  })
  .strict();
export type AstrologerClientListResponse = z.infer<typeof astrologerClientListResponseSchema>;

export const astrologerClientResponseSchema = z
  .object({
    client: astrologerClientResponseItemSchema
  })
  .strict();
export type AstrologerClientResponse = z.infer<typeof astrologerClientResponseSchema>;
