import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();

const chartJsonRecordSchema = z.record(z.string(), z.unknown());

export const chartSettingsSchema = z
  .object({
    zodiac: z.literal("tropical").optional().default("tropical"),
    houseSystem: z.enum(["placidus", "koch", "whole_sign", "equal", "regiomontanus"]),
    nodeType: z.enum(["true", "mean"]),
    aspectPreset: z.enum(["major", "major_minor"]),
    orbMultiplier: z.number().min(0.5).max(1.5)
  })
  .strict();
export type ChartSettings = z.infer<typeof chartSettingsSchema>;

export const chartNatalJobCreateRequestSchema = z
  .object({
    clientId: uuidSchema,
    settings: chartSettingsSchema
  })
  .strict();
export type ChartNatalJobCreateRequest = z.infer<typeof chartNatalJobCreateRequestSchema>;

export const chartPublicJobStatusSchema = z.enum(["calculating", "succeeded", "failed"]);
export type ChartPublicJobStatus = z.infer<typeof chartPublicJobStatusSchema>;

export const chartJobResponseSchema = z
  .object({
    id: uuidSchema,
    status: chartPublicJobStatusSchema,
    calculationId: uuidSchema.nullable().optional().default(null),
    failureCode: z.string().trim().min(1).max(100).nullable().optional().default(null),
    failureMessage: z.string().trim().min(1).max(500).nullable().optional().default(null)
  })
  .strict();
export type ChartJobResponse = z.infer<typeof chartJobResponseSchema>;

export const chartCalculationResponseSchema = z
  .object({
    calculationId: uuidSchema,
    result: z.unknown()
  })
  .strict();
export type ChartCalculationResponse = z.infer<typeof chartCalculationResponseSchema>;

export const chartNatalJobCreateResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("calculating"),
      jobId: uuidSchema
    })
    .strict(),
  z
    .object({
      status: z.literal("succeeded"),
      calculationId: uuidSchema,
      result: z.unknown()
    })
    .strict()
]);
export type ChartNatalJobCreateResponse = z.infer<typeof chartNatalJobCreateResponseSchema>;

export const chartProviderMetadataSchema = z
  .object({
    name: z.literal("kerykeion"),
    version: z.string().trim().min(1).max(100),
    ephemeris: z.string().trim().min(1).max(100)
  })
  .strict();
export type ChartProviderMetadata = z.infer<typeof chartProviderMetadataSchema>;

export const chartInputSnapshotSchema = z
  .object({
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    birthTime: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().trim().min(1).max(100),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    birthTimePrecision: z.enum(["exact", "approximate"]),
    dstOccurrence: z.enum(["first", "second"]).optional()
  })
  .strict();
export type ChartInputSnapshot = z.infer<typeof chartInputSnapshotSchema>;

export const chartNatalCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal("chart-request.v1"),
    method: z.literal("natal"),
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema
  })
  .strict();
export type ChartNatalCalculationRequestInput = z.input<
  typeof chartNatalCalculationRequestSchema
>;
export type ChartNatalCalculationRequest = z.infer<typeof chartNatalCalculationRequestSchema>;

export const chartPointSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
    longitude: z.number().min(0).lt(360),
    sign: z.string().trim().min(1).max(40),
    signDegree: z.number().min(0).lt(30),
    house: z.number().int().min(1).max(12).nullable().optional(),
    retrograde: z.boolean().nullable().optional()
  })
  .strict();
export type ChartPoint = z.infer<typeof chartPointSchema>;

export const chartHouseSchema = z
  .object({
    number: z.number().int().min(1).max(12),
    longitude: z.number().min(0).lt(360),
    sign: z.string().trim().min(1).max(40),
    signDegree: z.number().min(0).lt(30)
  })
  .strict();
export type ChartHouse = z.infer<typeof chartHouseSchema>;

export const chartAspectSchema = z
  .object({
    pointA: z.string().trim().min(1).max(80),
    pointB: z.string().trim().min(1).max(80),
    type: z.string().trim().min(1).max(80),
    angle: z.number().min(0).max(180),
    orb: z.number().min(0),
    applying: z.boolean().nullable().optional(),
    strength: z.number().min(0).max(1).nullable().optional()
  })
  .strict();
export type ChartAspect = z.infer<typeof chartAspectSchema>;

export const chartDistributionsSchema = z
  .object({
    elements: z.record(z.string(), z.number().int().min(0)),
    modalities: z.record(z.string(), z.number().int().min(0)),
    polarity: z.record(z.string(), z.number().int().min(0))
  })
  .strict();
export type ChartDistributions = z.infer<typeof chartDistributionsSchema>;

export const chartWarningSchema = z
  .object({
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(500)
  })
  .strict();
export type ChartWarning = z.infer<typeof chartWarningSchema>;

export const chartRenderResultSchema = z
  .object({
    points: z.array(chartPointSchema),
    houses: z.array(chartHouseSchema),
    aspects: z.array(chartAspectSchema),
    distributions: chartDistributionsSchema,
    warnings: z.array(chartWarningSchema)
  })
  .strict();
export type ChartRenderResult = z.infer<typeof chartRenderResultSchema>;

export const storedChartCalculationPayloadSchema = z
  .object({
    schemaVersion: z.literal("chart-result.v1"),
    method: z.literal("natal"),
    provider: chartProviderMetadataSchema,
    settings: chartSettingsSchema,
    inputSnapshot: chartInputSnapshotSchema,
    result: chartRenderResultSchema
  })
  .strict();
export type StoredChartCalculationPayload = z.infer<typeof storedChartCalculationPayloadSchema>;

export const chartCalculationResultRecordSchema = chartJsonRecordSchema;
