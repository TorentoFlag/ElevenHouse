import { z } from "@elevenhouse/validation";

import { ianaTimeZoneSchema, isoCalendarDateSchema } from "./calendar";
import { chartProviderMetadataSchema, chartSettingsSchema } from "./charts";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const dictionaryCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);
const stableIdSchema = z.string().trim().min(1).max(220);
const optionalTextSchema = z.string().trim().min(1).max(1_000).nullable();
const nonNegativeCountSchema = z.number().int().min(0).max(1_000_000);
const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const astroCalendarScopeValues = ["all", "global", "client"] as const;
export const astroCalendarScopeSchema = z.enum(astroCalendarScopeValues);
export type AstroCalendarScope = z.infer<typeof astroCalendarScopeSchema>;

export const astroCalendarEventTypeValues = [
  "global.moon_phase",
  "global.eclipse",
  "global.ingress",
  "client.birthday",
  "client.solar_window",
  "client.transit_aspect"
] as const;
export const astroCalendarEventTypeSchema = z.enum(astroCalendarEventTypeValues);
export type AstroCalendarEventType = z.infer<typeof astroCalendarEventTypeSchema>;

export const astroCalendarEventSourceSchema = z.enum(["global", "client"]);
export type AstroCalendarEventSource = z.infer<typeof astroCalendarEventSourceSchema>;

export const astroCalendarEventToneSchema = z.enum([
  "neutral",
  "supportive",
  "intense",
  "opportunity"
]);
export type AstroCalendarEventTone = z.infer<typeof astroCalendarEventToneSchema>;

export const astroCalendarTimePrecisionSchema = z.enum(["exact", "hour", "day"]);
export type AstroCalendarTimePrecision = z.infer<typeof astroCalendarTimePrecisionSchema>;

export const astroCalendarGenerationStatusSchema = z.enum([
  "ready",
  "calculating",
  "failed",
  "stale"
]);
export type AstroCalendarGenerationStatus = z.infer<typeof astroCalendarGenerationStatusSchema>;

export const astroCalendarWarningCodeSchema = z.enum([
  "NO_PROFILE_TIMEZONE",
  "CLIENT_BIRTH_DATA_MISSING",
  "CLIENT_BIRTH_TIME_UNKNOWN",
  "CLIENT_BIRTH_TIME_APPROXIMATE",
  "CLIENT_SCOPE_TRUNCATED",
  "PROVIDER_PRECISION_LIMITED",
  "GENERATION_FAILED",
  "DICTIONARY_ENTRY_MISSING"
]);
export type AstroCalendarWarningCode = z.infer<typeof astroCalendarWarningCodeSchema>;

export const astroCalendarWarningSeveritySchema = z.enum(["info", "warning", "error"]);
export type AstroCalendarWarningSeverity = z.infer<typeof astroCalendarWarningSeveritySchema>;

export const astroCalendarMissingDictionaryActionSchema = z
  .object({
    type: z.literal("create_dictionary_entry"),
    dictionaryCode: dictionaryCodeSchema,
    suggestedCategory: z.enum(["planet-sign", "planet-house", "aspect", "calendar"])
  })
  .strict();
export type AstroCalendarMissingDictionaryAction = z.infer<
  typeof astroCalendarMissingDictionaryActionSchema
>;

export const astroCalendarWarningSchema = z
  .object({
    code: astroCalendarWarningCodeSchema,
    severity: astroCalendarWarningSeveritySchema,
    message: z.string().trim().min(1).max(500),
    clientId: uuidSchema.nullable(),
    eventId: stableIdSchema.nullable(),
    dictionaryCode: dictionaryCodeSchema.nullable(),
    action: astroCalendarMissingDictionaryActionSchema.nullable()
  })
  .strict();
export type AstroCalendarWarning = z.infer<typeof astroCalendarWarningSchema>;

const queryUuidArraySchema = z.preprocess(normalizeQueryArray, z.array(uuidSchema).max(500));

const queryEventTypeArraySchema = z.preprocess(
  normalizeQueryArray,
  z.array(astroCalendarEventTypeSchema).max(astroCalendarEventTypeValues.length)
);

export const astroCalendarRangeQuerySchema = z
  .object({
    start: isoCalendarDateSchema,
    end: isoCalendarDateSchema,
    timeZone: ianaTimeZoneSchema,
    scope: astroCalendarScopeSchema.optional().default("all"),
    clientIds: queryUuidArraySchema,
    eventTypes: queryEventTypeArraySchema
  })
  .strict()
  .superRefine(addAstroCalendarDateRangeIssues);
export type AstroCalendarRangeQueryInput = z.input<typeof astroCalendarRangeQuerySchema>;
export type AstroCalendarRangeQuery = z.infer<typeof astroCalendarRangeQuerySchema>;

export const astroCalendarClientInputSnapshotSchema = z
  .object({
    clientId: uuidSchema,
    displayName: z.string().trim().min(1).max(160),
    initials: z.string().trim().min(1).max(8),
    birthDate: isoCalendarDateSchema,
    birthTime: clockTimeSchema.nullable(),
    birthTimePrecision: z.enum(["exact", "approximate", "unknown"]),
    birthTimezone: ianaTimeZoneSchema,
    birthLatitude: z.number().gte(-90).lte(90),
    birthLongitude: z.number().gte(-180).lte(180)
  })
  .strict();

export const astroCalendarGenerationRequestSchema = astroCalendarRangeQuerySchema
  .extend({
    clients: z
      .array(astroCalendarClientInputSnapshotSchema)
      .max(500)
      .optional()
      .default([]),
    settings: chartSettingsSchema
  })
  .strict();
export type AstroCalendarGenerationRequestInput = z.input<
  typeof astroCalendarGenerationRequestSchema
>;
export type AstroCalendarGenerationRequest = z.infer<typeof astroCalendarGenerationRequestSchema>;
export type AstroCalendarClientInputSnapshot = AstroCalendarGenerationRequest["clients"][number];

export const astroCalendarClientRefSchema = z
  .object({
    clientId: uuidSchema,
    displayName: z.string().trim().min(1).max(160),
    initials: z.string().trim().min(1).max(8)
  })
  .strict();
export type AstroCalendarClientRef = z.infer<typeof astroCalendarClientRefSchema>;

export const astroCalendarChartLinkSchema = z
  .object({
    mode: z.enum(["transit", "solar_return"]),
    clientId: uuidSchema,
    date: isoCalendarDateSchema
  })
  .strict();
export type AstroCalendarChartLink = z.infer<typeof astroCalendarChartLinkSchema>;

export const astroCalendarEventSchema = z
  .object({
    id: stableIdSchema,
    source: astroCalendarEventSourceSchema,
    type: astroCalendarEventTypeSchema,
    startsAt: instantSchema,
    endsAt: instantSchema.nullable(),
    timePrecision: astroCalendarTimePrecisionSchema,
    title: z.string().trim().min(1).max(220),
    subtitle: optionalTextSchema,
    description: optionalTextSchema,
    tone: astroCalendarEventToneSchema,
    points: z.array(z.string().trim().min(1).max(80)).max(8),
    aspect: z.string().trim().min(1).max(80).nullable(),
    sign: z.string().trim().min(1).max(80).nullable(),
    clientRefs: z.array(astroCalendarClientRefSchema).max(50),
    chartLink: astroCalendarChartLinkSchema.nullable(),
    dictionaryCodes: z.array(dictionaryCodeSchema).max(50),
    warnings: z.array(astroCalendarWarningSchema).max(20)
  })
  .strict()
  .superRefine((event, context) => {
    if (event.endsAt !== null && Date.parse(event.endsAt) < Date.parse(event.startsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "Event end must be after or equal to start"
      });
    }

    if (event.source === "global" && event.clientRefs.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clientRefs"],
        message: "Global events cannot include client references"
      });
    }

    if (event.source === "client" && event.clientRefs.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clientRefs"],
        message: "Client events require at least one client reference"
      });
    }
  });
export type AstroCalendarEvent = z.infer<typeof astroCalendarEventSchema>;

export const astroCalendarReadinessSummarySchema = z
  .object({
    clientsTotal: nonNegativeCountSchema,
    clientsReady: nonNegativeCountSchema,
    clientsWithMissingBirthData: nonNegativeCountSchema,
    clientsWithUnknownBirthTime: nonNegativeCountSchema,
    clientsWithApproximateBirthTime: nonNegativeCountSchema
  })
  .strict()
  .superRefine((summary, context) => {
    if (summary.clientsReady > summary.clientsTotal) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clientsReady"],
        message: "Ready clients cannot exceed total clients"
      });
    }
  });
export type AstroCalendarReadinessSummary = z.infer<typeof astroCalendarReadinessSummarySchema>;

export const astroCalendarSummarySchema = z
  .object({
    eventCount: nonNegativeCountSchema,
    globalEventCount: nonNegativeCountSchema,
    clientEventCount: nonNegativeCountSchema,
    byType: z.record(z.string(), nonNegativeCountSchema),
    byTone: z.record(z.string(), nonNegativeCountSchema)
  })
  .strict()
  .superRefine((summary, context) => {
    if (summary.globalEventCount + summary.clientEventCount !== summary.eventCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eventCount"],
        message: "Event count must equal global and client event totals"
      });
    }
  });
export type AstroCalendarSummary = z.infer<typeof astroCalendarSummarySchema>;

export const astroCalendarGenerationMetadataSchema = z
  .object({
    status: astroCalendarGenerationStatusSchema,
    generationId: uuidSchema.nullable(),
    fingerprint: z.string().trim().min(16).max(160),
    generatedAt: instantSchema.nullable(),
    provider: chartProviderMetadataSchema.nullable()
  })
  .strict()
  .superRefine((generation, context) => {
    if (generation.status === "ready" && generation.generatedAt === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generatedAt"],
        message: "Ready generation requires generatedAt"
      });
    }

    if (generation.status === "ready" && generation.provider === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provider"],
        message: "Ready generation requires provider metadata"
      });
    }
  });
export type AstroCalendarGenerationMetadata = z.infer<typeof astroCalendarGenerationMetadataSchema>;

export const astroCalendarRangeResponseSchema = z
  .object({
    schemaVersion: z.literal("astro-calendar-range.v1"),
    timeZone: ianaTimeZoneSchema,
    range: z
      .object({
        start: isoCalendarDateSchema,
        end: isoCalendarDateSchema
      })
      .strict()
      .superRefine(addAstroCalendarDateRangeIssues),
    generation: astroCalendarGenerationMetadataSchema,
    events: z.array(astroCalendarEventSchema).max(5_000),
    readiness: astroCalendarReadinessSummarySchema,
    summary: astroCalendarSummarySchema,
    dictionaryCodes: z.array(dictionaryCodeSchema).max(1_000),
    warnings: z.array(astroCalendarWarningSchema).max(1_000)
  })
  .strict()
  .superRefine((response, context) => {
    if (response.summary.eventCount !== response.events.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["summary", "eventCount"],
        message: "Summary event count must match events length"
      });
    }
  });
export type AstroCalendarRangeResponse = z.infer<typeof astroCalendarRangeResponseSchema>;

function normalizeQueryArray(value: unknown): unknown {
  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeQueryArrayItem(item));
  }

  return normalizeQueryArrayItem(value);
}

function normalizeQueryArrayItem(value: unknown): unknown[] {
  if (typeof value !== "string") {
    return [value];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function addAstroCalendarDateRangeIssues(
  range: { start: string; end: string },
  context: z.RefinementCtx
) {
  const start = parseIsoCalendarDateUtc(range.start);
  const end = parseIsoCalendarDateUtc(range.end);

  if (end < start) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["end"],
      message: "Astro calendar range end cannot be before start"
    });
    return;
  }

  if (end - start > 93 * 24 * 60 * 60 * 1_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["end"],
      message: "Astro calendar range cannot exceed 93 days"
    });
  }
}

function parseIsoCalendarDateUtc(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}
