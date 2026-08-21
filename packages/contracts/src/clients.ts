import { ianaTimeZoneSchema, nonEmptyStringSchema, z } from "@elevenhouse/validation";
import { astrologerPublicHandleSchema } from "./astrologer-profile";
import { bookingLifecycleStateSchema } from "./calendar";
import { moneyAmountMinorSchema, rubCurrencySchema } from "./money";
import { orderStatusSchema } from "./orders";
import { paymentAttemptStatusSchema } from "./payments";
import { SessionStateSchema } from "./sessions";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime();
const nullableResponseStringSchema = z.string().trim().max(500).nullable();
const displayNameRequestSchema = z.string().trim().min(1).max(200);
const relationshipLabelRequestSchema = z.string().trim().min(1).max(100);

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

export const clientBirthDataSourceSchema = z.enum(["client_profile", "import", "manual"]);
export type ClientBirthDataSource = z.infer<typeof clientBirthDataSourceSchema>;

export const clientBirthDataEditorRoleSchema = z.enum(["client", "astrologer"]);
export type ClientBirthDataEditorRole = z.infer<typeof clientBirthDataEditorRoleSchema>;

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
    expectedRevision: z.number().int().min(1).nullable()
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
    revision: z.number().int().min(1),
    lastEditedByUserId: uuidSchema,
    lastEditedByRole: clientBirthDataEditorRoleSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict();
export type ClientBirthDataResponse = z.infer<typeof clientBirthDataResponseSchema>;

export const clientRelatedBirthProfileUpsertRequestSchema = clientBirthDataUpsertRequestSchema
  .extend({
    displayName: displayNameRequestSchema,
    relationshipLabel: relationshipLabelRequestSchema
  })
  .strict();
export type ClientRelatedBirthProfileUpsertRequest = z.infer<
  typeof clientRelatedBirthProfileUpsertRequestSchema
>;

export const clientRelatedBirthProfileResponseSchema = clientBirthDataResponseSchema
  .omit({ label: true })
  .extend({
    displayName: z.string().trim().min(1).max(200),
    relationshipLabel: z.string().trim().min(1).max(100)
  })
  .strict();
export type ClientRelatedBirthProfileResponse = z.infer<
  typeof clientRelatedBirthProfileResponseSchema
>;

export const clientRelatedBirthProfileListResponseSchema = z
  .object({
    profiles: z.array(clientRelatedBirthProfileResponseSchema)
  })
  .strict();
export type ClientRelatedBirthProfileListResponse = z.infer<
  typeof clientRelatedBirthProfileListResponseSchema
>;

export const clientBirthPlaceSearchQuerySchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .transform((value) => value.replace(/\s+/g, " ")),
    limit: z.coerce.number().int().min(1).max(10).optional().default(5)
  })
  .strict();
export type ClientBirthPlaceSearchQuery = z.infer<typeof clientBirthPlaceSearchQuerySchema>;

export const clientBirthPlaceProviderPlaceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._~-]+$/);

export const clientBirthPlaceCandidateSchema = z
  .object({
    id: z.string().trim().min(1).max(256),
    label: z.string().trim().min(1).max(500),
    placeName: z.string().trim().min(1).max(500),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    city: nullableResponseStringSchema,
    region: nullableResponseStringSchema,
    timezone: ianaTimeZoneSchema,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    provider: z.enum(["geoapify"]),
    providerPlaceId: clientBirthPlaceProviderPlaceIdSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (value.id !== `${value.provider}:${value.providerPlaceId}`) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: "Birth place candidate id must match its provider reference"
      });
    }
  });
export type ClientBirthPlaceCandidate = z.infer<typeof clientBirthPlaceCandidateSchema>;

export const clientBirthPlaceReferenceParamsSchema = z
  .object({
    providerPlaceId: clientBirthPlaceProviderPlaceIdSchema
  })
  .strict();
export type ClientBirthPlaceReferenceParams = z.infer<typeof clientBirthPlaceReferenceParamsSchema>;

export const clientBirthPlaceReferenceResponseSchema = clientBirthPlaceCandidateSchema;
export type ClientBirthPlaceReferenceResponse = z.infer<
  typeof clientBirthPlaceReferenceResponseSchema
>;

export const clientBirthPlaceSearchResponseSchema = z
  .object({
    candidates: z.array(clientBirthPlaceCandidateSchema)
  })
  .strict();
export type ClientBirthPlaceSearchResponse = z.infer<typeof clientBirthPlaceSearchResponseSchema>;

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
    birthData: clientBirthDataResponseSchema.nullable(),
    relatedBirthProfiles: z.array(clientRelatedBirthProfileResponseSchema).optional(),
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
  .strict();
export type ClientCabinetOverviewResponse = z.infer<typeof clientCabinetOverviewResponseSchema>;

export const astrologerClientResponseItemSchema = z
  .object({
    clientUserId: uuidSchema,
    displayName: z.string().trim().min(1).max(200).nullable(),
    relationshipStatus: clientRelationshipStatusSchema,
    firstLinkedAt: timestampSchema,
    lastLinkedAt: timestampSchema,
    birthData: clientBirthDataResponseSchema.nullable(),
    relatedBirthProfiles: z.array(clientRelatedBirthProfileResponseSchema).optional()
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

export const clientRelatedBirthProfileParamsSchema = z
  .object({
    clientUserId: uuidSchema,
    relatedProfileId: uuidSchema
  })
  .strict();
export type ClientRelatedBirthProfileParams = z.infer<typeof clientRelatedBirthProfileParamsSchema>;

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

export const clientRelationshipSourceSchema = z.enum([
  "direct_link",
  "booking",
  "order",
  "lead_magnet",
  "manual"
]);
export type ClientRelationshipSource = z.infer<typeof clientRelationshipSourceSchema>;

export const clientLifecycleStatusSchema = z.enum([
  "new",
  "active",
  "waiting_for_client",
  "in_service",
  "inactive"
]);
export type ClientLifecycleStatus = z.infer<typeof clientLifecycleStatusSchema>;

export const clientLifecycleModeSchema = z.enum(["automatic", "manual_override"]);
export type ClientLifecycleMode = z.infer<typeof clientLifecycleModeSchema>;

const clientCrmCursorSchema = z.string().trim().min(1).max(512);
const clientCrmRelativeHrefSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^\/(?!\/)/, "CRM activity links must be relative internal paths")
  .refine((value) => !value.includes("\\"), "CRM activity links cannot contain backslashes");

const clientCrmPrivateTagSchema = z.string().trim().min(1).max(64);
const clientCrmPrivateTagsSchema = z
  .array(clientCrmPrivateTagSchema)
  .max(12)
  .superRefine((tags, context) => {
    const seen = new Set<string>();
    for (const [index, tag] of tags.entries()) {
      const key = tag.toLocaleLowerCase("en-US");
      if (seen.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: "CRM private tags must be unique"
        });
      }
      seen.add(key);
    }
  });

const clientCrmPrivateTagsRequestSchema = z
  .array(z.string().trim().max(64))
  .max(24)
  .transform((tags) => {
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const tag of tags) {
      const value = tag.replace(/\s+/g, " ").trim();
      if (value.length === 0) continue;
      const key = value.toLocaleLowerCase("en-US");
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(value);
    }
    return normalized;
  })
  .pipe(clientCrmPrivateTagsSchema);

const clientCrmPrivateNoteRequestSchema = z
  .union([
    z
      .string()
      .max(2000)
      .transform((value) => {
        const normalized = value.replace(/\s+/g, " ").trim();
        return normalized.length === 0 ? null : normalized;
      }),
    z.null()
  ])
  .transform((value) => value ?? null);

export const clientCrmPrivateProfileSchema = z
  .object({
    note: z.string().trim().max(2000).nullable(),
    tags: clientCrmPrivateTagsSchema,
    updatedAt: timestampSchema
  })
  .strict();
export type ClientCrmPrivateProfile = z.infer<typeof clientCrmPrivateProfileSchema>;

export const astrologerClientCrmPrivateProfileUpdateRequestSchema = z
  .object({
    note: clientCrmPrivateNoteRequestSchema,
    tags: clientCrmPrivateTagsRequestSchema
  })
  .strict();
export type AstrologerClientCrmPrivateProfileUpdateRequest = z.infer<
  typeof astrologerClientCrmPrivateProfileUpdateRequestSchema
>;

export const astrologerClientCrmPrivateProfileUpdateResponseSchema = z
  .object({
    privateCrm: clientCrmPrivateProfileSchema
  })
  .strict();
export type AstrologerClientCrmPrivateProfileUpdateResponse = z.infer<
  typeof astrologerClientCrmPrivateProfileUpdateResponseSchema
>;

export const clientCrmRelationshipSchema = z
  .object({
    id: uuidSchema,
    status: clientRelationshipStatusSchema,
    source: clientRelationshipSourceSchema,
    firstLinkedAt: timestampSchema,
    lastLinkedAt: timestampSchema
  })
  .strict();
export type ClientCrmRelationship = z.infer<typeof clientCrmRelationshipSchema>;

export const clientCrmLifecycleSchema = z
  .object({
    status: clientLifecycleStatusSchema,
    mode: clientLifecycleModeSchema,
    revision: z.number().int().min(1),
    lastActivityAt: timestampSchema
  })
  .strict();
export type ClientCrmLifecycle = z.infer<typeof clientCrmLifecycleSchema>;

export const clientCrmReadinessSchema = z
  .object({
    birthData: z.enum(["ready", "missing"]),
    relatedProfiles: z.enum(["ready", "missing"])
  })
  .strict();
export type ClientCrmReadiness = z.infer<typeof clientCrmReadinessSchema>;

export const clientCrmServiceWorkBookingItemSchema = z
  .object({
    id: uuidSchema,
    state: bookingLifecycleStateSchema,
    productTitle: z.string().trim().min(1).max(200),
    startAt: timestampSchema,
    endAt: timestampSchema,
    timeZone: ianaTimeZoneSchema,
    href: clientCrmRelativeHrefSchema
  })
  .strict()
  .superRefine((item, context) => {
    if (Date.parse(item.startAt) >= Date.parse(item.endAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "CRM service-work booking end must be after start"
      });
    }
  });
export type ClientCrmServiceWorkBookingItem = z.infer<typeof clientCrmServiceWorkBookingItemSchema>;

export const clientCrmServiceWorkSessionItemSchema = z
  .object({
    id: uuidSchema,
    bookingId: uuidSchema,
    state: SessionStateSchema,
    productTitle: z.string().trim().min(1).max(200),
    scheduledStartAt: timestampSchema,
    scheduledEndAt: timestampSchema,
    timeZone: ianaTimeZoneSchema,
    href: clientCrmRelativeHrefSchema
  })
  .strict()
  .superRefine((item, context) => {
    if (Date.parse(item.scheduledStartAt) >= Date.parse(item.scheduledEndAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledEndAt"],
        message: "CRM service-work session end must be after start"
      });
    }
  });
export type ClientCrmServiceWorkSessionItem = z.infer<typeof clientCrmServiceWorkSessionItemSchema>;

export const clientCrmServiceWorkOrderItemSchema = z
  .object({
    id: uuidSchema,
    status: orderStatusSchema,
    productTitle: z.string().trim().min(1).max(200),
    amountMinor: moneyAmountMinorSchema,
    currency: rubCurrencySchema,
    bookingId: uuidSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    href: clientCrmRelativeHrefSchema.optional()
  })
  .strict();
export type ClientCrmServiceWorkOrderItem = z.infer<typeof clientCrmServiceWorkOrderItemSchema>;

export const clientCrmServiceWorkPaymentItemSchema = z
  .object({
    id: uuidSchema,
    orderId: uuidSchema,
    status: paymentAttemptStatusSchema,
    amountMinor: moneyAmountMinorSchema,
    currency: rubCurrencySchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    href: clientCrmRelativeHrefSchema.optional()
  })
  .strict();
export type ClientCrmServiceWorkPaymentItem = z.infer<typeof clientCrmServiceWorkPaymentItemSchema>;

export const clientCrmServiceWorkSummarySchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      bookings: z
        .object({
          upcomingTotal: z.number().int().min(0),
          upcoming: z.array(clientCrmServiceWorkBookingItemSchema).max(3),
          recentTotal: z.number().int().min(0),
          recent: z.array(clientCrmServiceWorkBookingItemSchema).max(3)
        })
        .strict(),
      sessions: z
        .object({
          upcomingTotal: z.number().int().min(0),
          upcoming: z.array(clientCrmServiceWorkSessionItemSchema).max(3),
          recentTotal: z.number().int().min(0),
          recent: z.array(clientCrmServiceWorkSessionItemSchema).max(3)
        })
        .strict(),
      orders: z
        .object({
          recentTotal: z.number().int().min(0),
          recent: z.array(clientCrmServiceWorkOrderItemSchema).max(3)
        })
        .strict(),
      payments: z
        .object({
          recentTotal: z.number().int().min(0),
          recent: z.array(clientCrmServiceWorkPaymentItemSchema).max(3)
        })
        .strict()
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      source: z.enum(["bookings", "sessions", "finance"]),
      code: z.literal("summary_unavailable"),
      retryable: z.boolean()
    })
    .strict()
]);
export type ClientCrmServiceWorkSummary = z.infer<typeof clientCrmServiceWorkSummarySchema>;

const clientCrmRelationshipCreatedActivityMetadataSchema = z
  .object({
    source: clientRelationshipSourceSchema
  })
  .strict();

const clientCrmLifecycleChangedActivityMetadataSchema = z
  .object({
    previousStatus: clientLifecycleStatusSchema.nullable(),
    status: clientLifecycleStatusSchema,
    mode: clientLifecycleModeSchema
  })
  .strict();

const clientCrmBirthDataUpdatedActivityMetadataSchema = z
  .object({
    revision: z.number().int().min(1)
  })
  .strict();

const clientCrmRelatedBirthProfileUpdatedActivityMetadataSchema = z
  .object({
    relatedProfileId: uuidSchema,
    revision: z.number().int().min(1)
  })
  .strict();

export const clientCrmActivityItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: z.string().trim().min(1).max(200),
      occurredAt: timestampSchema,
      kind: z.literal("relationship_created"),
      metadata: clientCrmRelationshipCreatedActivityMetadataSchema,
      href: clientCrmRelativeHrefSchema.optional()
    })
    .strict(),
  z
    .object({
      id: z.string().trim().min(1).max(200),
      occurredAt: timestampSchema,
      kind: z.literal("lifecycle_changed"),
      metadata: clientCrmLifecycleChangedActivityMetadataSchema,
      href: clientCrmRelativeHrefSchema.optional()
    })
    .strict(),
  z
    .object({
      id: z.string().trim().min(1).max(200),
      occurredAt: timestampSchema,
      kind: z.literal("birth_data_updated"),
      metadata: clientCrmBirthDataUpdatedActivityMetadataSchema,
      href: clientCrmRelativeHrefSchema.optional()
    })
    .strict(),
  z
    .object({
      id: z.string().trim().min(1).max(200),
      occurredAt: timestampSchema,
      kind: z.literal("related_birth_profile_updated"),
      metadata: clientCrmRelatedBirthProfileUpdatedActivityMetadataSchema,
      href: clientCrmRelativeHrefSchema.optional()
    })
    .strict()
]);
export type ClientCrmActivityItem = z.infer<typeof clientCrmActivityItemSchema>;

export const clientCrmActivityQuerySchema = z
  .object({
    cursor: clientCrmCursorSchema.nullish().default(null),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20)
  })
  .strict();
export type ClientCrmActivityQuery = z.infer<typeof clientCrmActivityQuerySchema>;

export const clientCrmActivityPageResponseSchema = z
  .object({
    items: z.array(clientCrmActivityItemSchema).max(50),
    nextCursor: clientCrmCursorSchema.nullable()
  })
  .strict();
export type ClientCrmActivityPageResponse = z.infer<typeof clientCrmActivityPageResponseSchema>;

export const astrologerClientCrmListQuerySchema = z
  .object({
    query: z
      .string()
      .trim()
      .max(100)
      .transform((value) => value.replace(/\s+/g, " "))
      .optional()
      .default(""),
    cursor: clientCrmCursorSchema.nullish().default(null),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    lifecycle: clientLifecycleStatusSchema.optional(),
    source: clientRelationshipSourceSchema.optional(),
    sort: z.literal("last_linked_at_desc").optional().default("last_linked_at_desc")
  })
  .strict();
export type AstrologerClientCrmListQuery = z.infer<typeof astrologerClientCrmListQuerySchema>;

export const astrologerClientCrmListItemSchema = z
  .object({
    clientUserId: uuidSchema,
    displayName: z.string().trim().min(1).max(200).nullable(),
    relationship: clientCrmRelationshipSchema,
    lifecycle: clientCrmLifecycleSchema,
    privateCrm: clientCrmPrivateProfileSchema,
    readiness: clientCrmReadinessSchema
  })
  .strict();
export type AstrologerClientCrmListItem = z.infer<typeof astrologerClientCrmListItemSchema>;

export const astrologerClientCrmListResponseSchema = z
  .object({
    items: z.array(astrologerClientCrmListItemSchema).max(50),
    nextCursor: clientCrmCursorSchema.nullable()
  })
  .strict();
export type AstrologerClientCrmListResponse = z.infer<typeof astrologerClientCrmListResponseSchema>;

export const astrologerClientCrmDetailSchema = z
  .object({
    clientUserId: uuidSchema,
    displayName: z.string().trim().min(1).max(200).nullable(),
    relationship: clientCrmRelationshipSchema,
    lifecycle: clientCrmLifecycleSchema,
    birthData: clientBirthDataResponseSchema.nullable(),
    relatedBirthProfiles: z.array(clientRelatedBirthProfileResponseSchema).max(50),
    readiness: clientCrmReadinessSchema,
    privateCrm: clientCrmPrivateProfileSchema,
    serviceWork: clientCrmServiceWorkSummarySchema.optional(),
    activity: clientCrmActivityPageResponseSchema
  })
  .strict();
export type AstrologerClientCrmDetail = z.infer<typeof astrologerClientCrmDetailSchema>;

export const astrologerClientCrmDetailResponseSchema = z
  .object({
    client: astrologerClientCrmDetailSchema
  })
  .strict();
export type AstrologerClientCrmDetailResponse = z.infer<
  typeof astrologerClientCrmDetailResponseSchema
>;

export const astrologerClientCrmManualClientCreateRequestSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2)
      .max(200)
      .transform((value) => value.replace(/\s+/g, " ")),
    preferredLocale: z.enum(["ru", "en"]).nullable().optional().default(null),
    timezone: ianaTimeZoneSchema.nullable().optional().default(null)
  })
  .strict();
export type AstrologerClientCrmManualClientCreateRequest = z.infer<
  typeof astrologerClientCrmManualClientCreateRequestSchema
>;

export const astrologerClientCrmManualClientCreateResponseSchema = z
  .object({
    client: astrologerClientCrmDetailSchema
  })
  .strict();
export type AstrologerClientCrmManualClientCreateResponse = z.infer<
  typeof astrologerClientCrmManualClientCreateResponseSchema
>;
